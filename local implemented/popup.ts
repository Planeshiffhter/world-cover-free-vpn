import type {RouteController} from './core.js';
type Snapshot = ReturnType<RouteController['snapshot']>;
type Elements = {
  origin: HTMLInputElement; username: HTMLInputElement; password: HTMLInputElement; gateways: HTMLSelectElement;
  connect: HTMLButtonElement; disconnect: HTMLButtonElement; emergency: HTMLButtonElement; logout: HTMLButtonElement;
  login: HTMLFormElement; controls: HTMLElement; status: HTMLElement; message: HTMLElement; indicator: HTMLElement;
  expires: HTMLElement; error: HTMLElement; empty: HTMLElement;
};
const $ = <T extends keyof Elements>(id: T): Elements[T] => document.getElementById(id) as Elements[T];
let current: Snapshot;
async function send(type: string, payload: Record<string, string> = {}) {
  const response = await chrome.runtime.sendMessage({type, ...payload});
  if (!response?.ok) throw new Error(response?.error || 'The extension worker did not respond.');
  return response.value;
}
function show(state: Snapshot) {
  current = state;
  const names = {disconnected: 'Disconnected', connecting: 'Checking route', connected: 'Connected · verified', fixture: 'Fixture verified', error: 'Route needs attention'};
  $('status').textContent = names[state.status] || 'Route needs attention';
  $('message').textContent = state.message;
  $('indicator').className = `indicator ${state.status}`;
  $('expires').textContent = state.expiresAt ? `Grant expires ${new Date(state.expiresAt).toLocaleTimeString()}` : '';
  $('login').hidden = state.signedIn;
  $('controls').hidden = !state.signedIn;
  $('connect').hidden = state.routingActive;
  $('disconnect').hidden = !state.routingActive;
  $('emergency').hidden = !state.routingActive || state.signedIn;
  if (!$('origin').value) $('origin').value = state.origin;
}
async function busy(action: () => Promise<void>) {
  $('error').hidden = true;
  document.querySelectorAll('button').forEach(b => b.disabled = true);
  try { await action(); }
  catch (error) { $('error').textContent = error instanceof Error ? error.message : 'Extension request failed.'; $('error').hidden = false; }
  finally {
    try { show(await send('status')); } catch { /* Keep the actionable error. */ }
    document.querySelectorAll('button').forEach(b => b.disabled = false);
    if (!$('gateways').options.length) $('connect').disabled = true;
  }
}
async function loadGateways() {
  const gateways = await send('gateways');
  $('gateways').replaceChildren(...gateways.map((g: import('./core.js').Gateway) => {
    const option = document.createElement('option'); option.value = g.id;
    option.textContent = `${g.name}${g.live ? ' · US gateway' : ' · LOCAL FIXTURE'}`; return option;
  }));
  $('empty').hidden = gateways.length > 0;
  $('gateways').hidden = gateways.length === 0;
}
$('login').addEventListener('submit', event => {
  event.preventDefault();
  busy(async () => {
    const password = $('password').value; $('password').value = '';
    show(await send('login', {origin: $('origin').value, username: $('username').value, password}));
    await loadGateways();
  });
});
$('connect').addEventListener('click', () => busy(async () => show(await send('connect', {gatewayId: $('gateways').value}))));
for (const id of ['disconnect', 'emergency'] as const) $(id).addEventListener('click', () => busy(async () => show(await send('disconnect'))));
$('logout').addEventListener('click', () => busy(async () => show(await send('logout'))));
busy(async () => { show(await send('status')); if (current.signedIn) await loadGateways(); });
