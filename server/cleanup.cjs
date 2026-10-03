const { cca } = require('./auth');
const Account = require('./models/Account');
const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const accounts = await Account.find({ email: { $ne: 'global_cache' } });
  
  for (const acc of accounts) {
    try {
      const msalAccount = await cca.getTokenCache().getAccountByHomeId(acc.homeAccountId);
      const tokenResponse = await cca.acquireTokenSilent({
          account: msalAccount,
          scopes: ["User.Read", "Mail.Read", "Mail.Send", "MailboxSettings.ReadWrite", "offline_access"]
      });
      const res = await fetch(`https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messageRules`, {
          headers: { 'Authorization': `Bearer ${tokenResponse.accessToken}` }
      });
      const data = await res.json();
      if (data.value) {
        for (const rule of data.value) {
          console.log(`Deleting ${rule.id} for ${acc.email}`);
          await fetch(`https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messageRules/${rule.id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${tokenResponse.accessToken}` }
          });
        }
      }
    } catch (e) {
      console.log("Error cleaning account", acc.email, e.message);
    }
  }
  process.exit(0);
}
run();
