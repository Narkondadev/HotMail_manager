const { cca } = require('./auth');
const Account = require('./models/Account');
const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const accountDoc = await Account.findOne({ email: 'liopa2299@hotmail.com' });
  if (!accountDoc) {
      console.log("Account not found");
      process.exit(1);
  }
  
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
  process.exit(0);
}
check();
