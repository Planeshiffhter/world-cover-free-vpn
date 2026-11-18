import {RouteController, authentication, type ActiveGrant} from './core.js';

const controller = new RouteController(chrome);
let operations: Promise<unknown> = controller.init();
const challenged = new Set<string>();
function enqueue<T>(action: () => Promise<T>): Promise<T> {
  const result = operations.catch(() => {}).then(action);
  operations = result;
  return result;
}

// Registered synchronously so MV3 worker wakeup cannot miss proxy challenges.
chrome.webRequest.onAuthRequired.addListener((details, callback) => {
  if (!callback) return;
  // Do not wait for the operations queue: route verification itself triggers this event.
  chrome.storage.session.get('session').then((data) => {
    const {session} = data as {session?: {active: ActiveGrant | null}};
    const response = authentication(details, session?.active);
    if (response.authCredentials) {
      if (challenged.has(details.requestId)) { callback({cancel: true}); return; }
      challenged.add(details.requestId);
    }
    callback(response);
  }).catch(() => callback({}));
}, {urls: ['<all_urls>']}, ['asyncBlocking']);
for (const event of [chrome.webRequest.onCompleted, chrome.webRequest.onErrorOccurred]) {
  event.addListener(details => challenged.delete(details.requestId), {urls: ['<all_urls>']});
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('popup.html')) return false;
  enqueue(async () => {
    switch (message?.type) {
      case 'status': {
        const {origin} = await chrome.storage.local.get('origin');
        return controller.snapshot(typeof origin === 'string' ? origin : undefined);
      }
      case 'login': return controller.login(message);
      case 'gateways': return controller.gateways();
      case 'connect': return controller.connect(message.gatewayId);
      case 'disconnect': return controller.disconnect();
      case 'logout': return controller.logout();
      default: throw new Error('Unsupported extension command.');
    }
  }).then(value => reply({ok: true, value}), error => reply({ok: false, error: error.message}));
  return true;
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'grant-expiry') enqueue(() => controller.expire());
  if (alarm.name === 'route-check') enqueue(() => controller.verify());
});
chrome.proxy.onProxyError.addListener(() => enqueue(async () => {
  if (!controller.metadata) return;
  controller.state = {status: 'error', message: 'The browser proxy reported a routing error. Proxy settings remain in place; disconnect explicitly to restore browsing.'};
  await controller.save();
}));
