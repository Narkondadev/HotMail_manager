const { cca } = require('./auth');
const Account = require('./models/Account');
const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const accounts = await Account.find({ email: { $ne: 'global_cache' } });
  if (accounts.length === 0) return console.log("No accounts");
  
  const acc = accounts[0];
  const msalAccount = await cca.getTokenCache().getAccountByHomeId(acc.homeAccountId);
  const tokenResponse = await cca.acquireTokenSilent({
      account: msalAccount,
      scopes: ["User.Read", "Mail.Read", "Mail.Send", "MailboxSettings.ReadWrite", "offline_access"]
  });
  
  const res = await fetch(`https://graph.microsoft.com/v1.0/me/mailFolders('inbox')/messages?$top=3`, {
      headers: { 'Authorization': `Bearer ${tokenResponse.accessToken}` }
  });
  const data = await res.json();
  console.log("Inbox messages:", data.value ? data.value.map(m => m.subject) : data);
  
  process.exit(0);
}
check();
