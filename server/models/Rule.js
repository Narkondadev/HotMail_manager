const mongoose = require('mongoose');

const ruleSchema = new mongoose.Schema({
    subjectQuery: { type: String, required: true },
    targetEmail: { type: String, required: true },
    graphRuleIds: {
        type: Map,
        of: String,
        default: {}
    }
});

module.exports = mongoose.model('Rule', ruleSchema);
