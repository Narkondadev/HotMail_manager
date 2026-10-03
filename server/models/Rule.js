const mongoose = require('mongoose');

const ruleSchema = new mongoose.Schema({
    subjectQuery: { type: String, required: true },
    targetEmail: { type: String, required: true },
    lastCheckedTime: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Rule', ruleSchema);
