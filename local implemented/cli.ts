import { Store } from './store.ts';
const [command, dbPath, username] = process.argv.slice(2);
if (!['create', 'recover'].includes(command) || !dbPath || !process.env.FOUNDER_PASSWORD) {
  console.error('Usage: FOUNDER_PASSWORD=<secure environment value> npm run account -- create|recover <database> [username]. Stop running services before recovery.');
  process.exitCode = 1;
} else {
  let store: Store | undefined;
  try {
    store = new Store(dbPath);
    if (command === 'create') store.createAccount(username || 'founder', process.env.FOUNDER_PASSWORD);
    else store.recover(process.env.FOUNDER_PASSWORD);
    console.log('Account operation completed. Passwords and tokens were not printed.');
  } catch { console.error('Account operation failed. Check database, account existence and password length (16–256).'); process.exitCode = 1; }
  finally { store?.close(); }
}
