const { cca } = require('./auth');
const Account = require('./models/Account');
const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });

async function checkAll() {
  await mongoose.connect(process.env.MONGODB_URI);
  const accounts = await Account.find({ email: { $ne: 'global_cache' } });
  
  for (const accountDoc of accounts) {
      console.log("Checking:", accountDoc.email);
      try {
          const msalAccount = await cca.getTokenCache().getAccountByHomeId(accountDoc.homeAccountId);
          const tokenResponse = await cca.acquireTokenSilent({
              account: msalAccount,
              scopes: ["User.Read", "Mail.Read", "Mail.Send", "MailboxSettings.ReadWrite", "offline_access"]
          });
          
          const res = await fetch(`https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messageRules`, {
              headers: { 'Authorization': `Bearer ${tokenResponse.accessToken}` }
          });
          const data = await res.json();
          console.log(JSON.stringify(data.value, null, 2));
      } catch (e) {
          console.log("Error:", e.message);
      }
  }
  process.exit(0);
}
checkAll();
