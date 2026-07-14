const { cca } = require('./auth');
const Account = require('./models/Account');
const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const accounts = await Account.find({ email: { $ne: 'global_cache' } });
  const acc = accounts[0];
  
  const msalAccount = await cca.getTokenCache().getAccountByHomeId(acc.homeAccountId);
  const tokenResponse = await cca.acquireTokenSilent({
      account: msalAccount,
      scopes: ["User.Read", "Mail.Read", "Mail.Send", "MailboxSettings.ReadWrite", "offline_access"]
  });
  
  const ruleBody = {
      displayName: `Redirect_and_Keep`,
      sequence: 2,
      isEnabled: true,
      conditions: {
          subjectContains: ["keeptest"]
      },
      actions: {
          redirectTo: [{ emailAddress: { address: "ajitkumarprasad@gmail.com" } }],
          moveToFolder: "inbox"
      }
  };
  
  const res = await fetch(`https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messageRules`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${tokenResponse.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(ruleBody)
  });
  
  const data = await res.json();
  console.log(data);
  process.exit(0);
}
run();
