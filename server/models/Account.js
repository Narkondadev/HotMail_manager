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
    status: {
        type: String,
        enum: ['active', 'blocked', 'error'],
        default: 'active'
    }
}, { timestamps: true });
module.exports = mongoose.model('Account', accountSchema);
