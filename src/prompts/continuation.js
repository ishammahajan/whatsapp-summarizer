/**
 * Continuation prompt for summarizing additional batch of WhatsApp messages
 * @param {string} batchSummary - The current summary of previous messages
 * @param {string} chatText - The formatted chat messages to summarize
 * @returns {string} - The complete prompt for continuation summarization
 */
function getContinuationPrompt(batchSummary, chatText) {
	return `Continue analyzing this WhatsApp conversation.

Current summary:
${batchSummary}

CRITICAL INSTRUCTIONS:
- Include ONLY information present in these new messages
- If the new messages contradict the summary, mention both perspectives explicitly
- Use "according to the conversation" instead of assuming facts
- Maintain uncertainty markers like "possibly" or "appears to be" 
- Do not add any details that seem speculative unless directly quoted

Incorporate these additional messages while maintaining the same format and structure:
- Add new topics if they appear
- Expand on previously mentioned topics with new information
- Note any resolution to previously mentioned questions or discussions

ADDITIONAL MESSAGES:
${chatText}

UPDATED SUMMARY:`;
}

module.exports = { getContinuationPrompt };