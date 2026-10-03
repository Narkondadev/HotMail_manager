const { cca } = require('./auth');
const mongoose = require('mongoose');
const Account = require('./models/Account');
mongoose.connect("mongodb+srv://tuihiyu_db_user:JQtS0gZgJj4wHEBS@cluster0.53l7mnf.mongodb.net/?appName=Cluster0");

async function test() {
    const acc = await Account.findOne({ email: 'jgfh56764@hotmail.com' });
    const msalAccount = await cca.getTokenCache().getAccountByHomeId(acc.homeAccountId);
    const tokenResponse = await cca.acquireTokenSilent({ account: msalAccount, scopes: ["User.Read", "Mail.Read", "Mail.Send", "offline_access"] });
    
    // Fetch the specific email
    const graphUrl = `https://graph.microsoft.com/v1.0/me/messages?$search="FW: Sign in"&$select=subject,bodyPreview,sender`;
    const res = await fetch(graphUrl, { headers: { 'Authorization': `Bearer ${tokenResponse.accessToken}`, 'ConsistencyLevel': 'eventual' } });
    const data = await res.json();
    
    console.log(data.value[0].bodyPreview);
    process.exit(0);
}
test();
