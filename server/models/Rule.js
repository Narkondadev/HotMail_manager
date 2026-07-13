const mongoose = require('mongoose');

const ruleSchema = new mongoose.Schema({
    subjectQuery: { type: String, required: true },
    targetEmail: { type: String, required: true },
    lastCheckedTime: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now },
    forwardCount: { type: Number, default: 0 },
    lastForwardedAt: { type: Date, default: null }
});

module.exports = mongoose.model('Rule', ruleSchema);
