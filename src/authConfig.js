export const msalConfig = {
    auth: {
        // REPLACE THIS WITH THE CLIENT ID FROM MICROSOFT ENTRA ADMIN CENTER
        clientId: "c21ffa55-3b60-422c-a9f8-66d221dbbff7", 
        // This authority allows both Microsoft personal accounts (Hotmail, Outlook, Xbox) and work/school accounts
        authority: "https://login.microsoftonline.com/common", 
        // Automatically uses localhost during development, and your live domain when hosted!
        redirectUri: window.location.origin,
    },
    cache: {
        cacheLocation: "localStorage", // Stores tokens permanently in localStorage so they survive browser restarts
        storeAuthStateInCookie: false, // Set this to "true" if you are having issues on IE11 or Edge
    }
};

// Add here scopes for id token to be used at MS Identity Platform endpoints.
export const loginRequest = {
    scopes: ["User.Read", "Mail.Read"]
};

