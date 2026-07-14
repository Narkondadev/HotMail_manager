const mongoose = require('mongoose');

const shareSchema = new mongoose.Schema({
    otp: { type: String, required: true, unique: true },
    hotmailEmail: { type: String, required: true },
    subjectQuery: { type: String, required: true },
    createdAt: { type: Date, default: Date.now, expires: 604800 } // Expires automatically in 7 days
});

module.exports = mongoose.model('Share', shareSchema);
