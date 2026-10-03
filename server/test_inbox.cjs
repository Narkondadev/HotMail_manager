const { cca } = require('./auth');
const Account = require('./models/Account');
const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const acc = await Account.findOne({ email: 'dibba927@hotmail.com' });
  if (!acc) return console.log("Account not found");
  
  const msalAccount = await cca.getTokenCache().getAccountByHomeId(acc.homeAccountId);
  const tokenResponse = await cca.acquireTokenSilent({
      account: msalAccount,
      scopes: ["User.Read", "Mail.Read", "Mail.Send", "MailboxSettings.ReadWrite", "offline_access"]
  });
  
  const res = await fetch(`https://graph.microsoft.com/v1.0/me/mailFolders('inbox')/messages?$top=5&$select=sender,subject,receivedDateTime`, {
      headers: { 'Authorization': `Bearer ${tokenResponse.accessToken}` }
  });
  const data = await res.json();
  console.log("Inbox messages:");
  if (data.value) {
    data.value.forEach(m => console.log(m.subject, "from", m.sender.emailAddress.address, "at", m.receivedDateTime));
  } else {
    console.log(data);
  }
  
  // check rules
  const rulesRes = await fetch(`https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messageRules`, {
      headers: { 'Authorization': `Bearer ${tokenResponse.accessToken}` }
  });
  const rulesData = await rulesRes.json();
  console.log("Rules:");
  console.log(JSON.stringify(rulesData.value, null, 2));
  
  process.exit(0);
}
check();
