const mongoose = require('mongoose');
const accountSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true
    },
    name: {
        type: String,
        required: true
    },
    homeAccountId: {
        type: String,
        required: true
    },
    refreshToken: {
        type: String,
        required: true
    },
    accessToken: {
        type: String, 
        required: false
    },
    // Per-account MSAL token cache (prevents loading the giant global blob per request)
    msalCache: {
        type: String,
        required: false
    },
    // DB-level email cache for instant loads (1-minute TTL)
    cachedEmails: {
        type: Array,
        default: []
    },
    emailsCachedAt: {
        type: Date,
        default: null
    },
    status: {
        type: String,
        enum: ['active', 'blocked', 'error'],
        default: 'active'
    }
}, { timestamps: true });
module.exports = mongoose.model('Account', accountSchema);

