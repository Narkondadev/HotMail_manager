const mongoose = require('mongoose');

const shareSchema = new mongoose.Schema({
    otp: { type: String, required: true },
    subjectQuery: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Share', shareSchema);
