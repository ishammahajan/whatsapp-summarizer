/**
 * System prompts for LLM API calls
 */

/**
 * System prompt for initial and continuation summarization
 * @returns {string} - The system prompt for summarization
 */
function getSummarizationSystemPrompt() {
	return 'You are an expert analyst who creates clear, structured summaries of group conversations. ONLY include information explicitly stated in the messages. Do not add any information not directly present in the input.';
}

/**
 * System prompt for consolidation of summaries
 * @returns {string} - The system prompt for consolidation
 */
function getConsolidationSystemPrompt() {
	return 'You are an expert analyst who creates clear, structured summaries of group conversations. Only include information explicitly stated in the summaries.';
}

/**
 * System prompt for final refinement
 * @returns {string} - The system prompt for refinement
 */
function getRefinementSystemPrompt() {
	return 'You are an expert analyst who creates clear, structured executive summaries. Only include information explicitly stated in the original summary.';
}

module.exports = {
	getSummarizationSystemPrompt,
	getConsolidationSystemPrompt,
	getRefinementSystemPrompt
};