"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.estimateTokens = estimateTokens;
exports.estimateMessagesTokens = estimateMessagesTokens;
exports.truncateToTokenBudget = truncateToTokenBudget;
const CHARS_PER_TOKEN = 4;
function estimateTokens(text) {
    return Math.ceil(text.length / CHARS_PER_TOKEN);
}
function estimateMessagesTokens(messages) {
    let total = 0;
    for (const m of messages) {
        total += estimateTokens(m.role) + estimateTokens(m.content) + 4;
    }
    return total + 2;
}
function truncateToTokenBudget(messages, maxTokens) {
    if (estimateMessagesTokens(messages) <= maxTokens)
        return messages;
    const result = [...messages];
    while (result.length > 1 && estimateMessagesTokens(result) > maxTokens) {
        result.splice(1, 1);
    }
    return result;
}
//# sourceMappingURL=token-estimator.js.map