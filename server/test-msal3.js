const msal = require('@azure/msal-node');
const msalConfig = {
    auth: {
        clientId: "fake-client",
        authority: `https://login.microsoftonline.com/common`,
        clientSecret: "fake-secret",
    }
};
global.fetch = undefined;
const cca = new msal.ConfidentialClientApplication(msalConfig);
cca.acquireTokenByCode({ code: "fake-code", redirectUri: "http://localhost", scopes: ["User.Read"] })
    .catch(e => console.log(e.toString()));
