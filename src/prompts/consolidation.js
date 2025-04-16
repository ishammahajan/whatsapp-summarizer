/**
 * Consolidation prompt for merging two summaries into one coherent summary
 * @param {string} fullSummary - The existing summary
 * @param {string} batchSummary - The new summary to consolidate with
 * @returns {string} - The complete prompt for consolidation
 */
function getConsolidationPrompt(fullSummary, batchSummary) {
	return `I have two summaries from different parts of the same WhatsApp conversation. Create a cohesive summary that integrates both.

CRITICAL INSTRUCTIONS:
- Include ONLY information present in either summary
- If the summaries contradict each other, mention both perspectives explicitly
- Use "according to the conversation" instead of assuming facts
- Maintain uncertainty markers like "possibly" or "appears to be" from the original summaries
- Remove any details that seem speculative unless directly quoted

FORMAT REQUIREMENTS:
1. Begin with a high-level overview (2-3 sentences) of CONFIRMED topics only
2. Organize by main discussion topics with clear headings
3. Use bullet points for key points under each topic
4. Highlight any decisions made or action items
5. Maintain chronological flow where relevant

FIRST SUMMARY:
${fullSummary}

SECOND SUMMARY:
${batchSummary}

COMBINED SUMMARY:`;
}

module.exports = { getConsolidationPrompt };