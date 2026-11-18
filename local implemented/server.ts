import https, { type ServerOptions } from 'node:https';
import type { AddressInfo } from 'node:net';
import type { Store } from './store.ts';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const staticFiles = new Map<string, readonly [string, string]>([['/', ['index.html', 'text/html']], ['/app.js', ['app.js', 'text/javascript']], ['/style.css', ['style.css', 'text/css']]]);
export interface GatewayDescription {
  id: string;
  live: boolean;
  host?: string;
  port?: number;
  country?: string;
  label?: string;
  scheme?: string;
  expectedExitIp?: string;
  routeCheckUrl?: string;
}
export interface ControlApiOptions {
  tls: ServerOptions;
  store: Store;
  gateways?: GatewayDescription[];
  revoke?: (id: string) => void;
  allowedOrigins?: string[];
  host?: string;
  port?: number;
}
interface LoginAttempt { start: number; count: number }
interface MutationAttempt extends LoginAttempt { expiresAt: number }

export function createControlApi({ tls, store, gateways = [], revoke = () => {}, allowedOrigins = [], host = '127.0.0.1', port = 0 }: ControlApiOptions) {
  const attempts = new Map<string | undefined, LoginAttempt>();
  const mutationAttempts = new Map<string, MutationAttempt>();
  const server = https.createServer({ ...tls, minVersion: 'TLSv1.2', maxHeaderSize: 8192 }, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    res.setHeader('Referrer-Policy', 'no-referrer');
    const json = (status: number, data: unknown): void => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
    try {
      const url = req.url!;
      if (url.length > 2048) return json(414, { error: 'Request too long' });
      const origin = req.headers.origin;
      // Same-origin dashboard and explicitly configured extension origins only.
      const ownOrigin = `https://${req.headers.host}`;
      if (origin && origin !== ownOrigin && !allowedOrigins.includes(origin)) return json(403, { error: 'Origin denied' });
      if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
      if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, POST, DELETE', 'Access-Control-Allow-Headers': 'Authorization, Content-Type' }); return res.end();
      }
      if (req.method === 'GET' && staticFiles.has(url)) {
        const [file, type] = staticFiles.get(url)!;
        const content = await readFile(fileURLToPath(new URL(`../../apps/operations/${file}`, import.meta.url)));
        res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }); return res.end(content);
      }
      if (req.method === 'GET' && url === '/healthz') return json(200, { status: 'ok', product: 'private-browser-proxy', releaseBlocked: true });
      let body: Record<string, unknown> = {};
      if (req.method === 'POST') {
        if (!req.headers['content-type']?.startsWith('application/json')) return json(415, { error: 'JSON required' });
        let size = 0; const chunks: Buffer[] = [];
        for await (const chunk of req) { size += chunk.length; if (size > 8192) return json(413, { error: 'Body too large' }); chunks.push(chunk); }
        try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { return json(400, { error: 'Invalid JSON' }); }
        if (!body || Array.isArray(body) || typeof body !== 'object') return json(400, { error: 'Invalid body' });
      }
      if (req.method === 'POST' && url === '/v1/login') {
        const key = req.socket.remoteAddress;
        const now = Date.now();
        for (const [k, v] of attempts) if (now - v.start > 60000) attempts.delete(k);
        const entry = attempts.get(key) || { start: now, count: 0 };
        if (entry.count >= 5 || attempts.size > 1024) { res.setHeader('Retry-After', '60'); return json(429, { error: 'Try again later' }); }
        entry.count++; attempts.set(key, entry);
        if (typeof body.username !== 'string' || typeof body.password !== 'string' || body.username.length > 64 || body.password.length > 256)
          return json(400, { error: 'Invalid credentials format' });
        const session = store.login(body.username, body.password);
        if (!session) return json(401, { error: 'Invalid credentials' });
        return json(200, session);
      }
      const token = req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]+)$/)?.[1];
      const session = store.session(token);
      if (!session) return json(401, { error: 'Authentication required' });
      if ((req.method === 'POST' && (url === '/v1/grants' || url === '/v1/logout')) ||
          (req.method === 'DELETE' && /^\/v1\/grants\/[a-f0-9]{32}$/.test(url))) {
        const now = Date.now();
        for (const [hash, entry] of mutationAttempts) {
          if (entry.expiresAt <= now || now - entry.start >= 60000) mutationAttempts.delete(hash);
        }
        const entry = mutationAttempts.get(session.hash) || { start: now, count: 0, expiresAt: session.expires_at };
        if (entry.count >= 30 || (!mutationAttempts.has(session.hash) && mutationAttempts.size >= 1024)) {
          res.setHeader('Retry-After', String(Math.max(1, Math.ceil((entry.start + 60000 - now) / 1000))));
          return json(429, { error: 'Too many account changes; try again later' });
        }
        entry.count++; mutationAttempts.set(session.hash, entry);
      }

      if (req.method === 'GET' && url === '/v1/gateways') return json(200, { gateways });
      if (req.method === 'GET' && url === '/v1/status') return json(200, { ...store.status(), gateways, mode: gateways.some(g => g.live) ? 'configured' : 'local', releaseBlocked: true });
      if (req.method === 'POST' && url === '/v1/grants') {
        const gateway = gateways.find(g => g.id === body.gatewayId);
        if (!gateway) return json(400, { error: 'Unknown gateway' });
        // A single founder connection grant prevents quota sharing across simultaneous grants.
        const old = store.db.prepare('SELECT id FROM grants WHERE revoked=0').all() as { id: string }[];
        for (const { id } of old) { store.revoke(id, session.hash); revoke(id); }
        try { return json(201, { ...store.issue(session.hash, gateway.id), gateway }); }
        catch { return json(403, { error: 'Quota exhausted' }); }
      }
      const grantId = url.match(/^\/v1\/grants\/([a-f0-9]{32})$/)?.[1];
      if (req.method === 'DELETE' && grantId) {
        if (!store.revoke(grantId, session.hash)) return json(404, { error: 'Grant not found' });
        revoke(grantId); return json(200, { revoked: true });
      }
      if (req.method === 'POST' && url === '/v1/logout') {
        for (const id of store.revokeSession(session.hash)) revoke(id);
        return json(200, { loggedOut: true });
      }
      return json(404, { error: 'Not found' });
    } catch { if (!res.headersSent) json(500, { error: 'Internal error' }); else res.destroy(); }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000; server.timeout = 15000;
  server.maxConnections = 32;
  return { server,
    listen: () => new Promise<AddressInfo>((resolve, reject) => { server.once('error', reject); server.listen(port, host, () => { server.off('error', reject); resolve(server.address() as AddressInfo); }); }),
    close: () => new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }) };
}
