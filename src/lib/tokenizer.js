const tiktoken = require('tiktoken');
const config = require('../../config/config');
const logger = require('../utils/logger');

// Create the tokenizer based on configuration
const encoder = tiktoken.get_encoding(config.tokenizer.encoding);

/**
 * Count tokens accurately using tiktoken
 * @param {string} text - Text to count tokens for
 * @returns {number} - Actual token count
 */
function countTokens(text) {
	if (!text) return 0;
	const tokens = encoder.encode(text);
	return tokens.length;
}

/**
 * Create chunks of messages based on token count using tiktoken
 * @param {Array} messages - Array of message objects
 * @param {Function} formatter - Function to format messages
 * @returns {Array} - Array of chunks, where each chunk is an array of formatted message strings
 */
function createTokenBasedChunks(messages, formatter) {
	const chunks = [];
	let currentChunk = [];
	let currentTokenCount = 0;

	// Increase system overhead to be more conservative
	const systemOverheadTokens = 500;  // Was 250, increased to account for prompt formatting
	// Reduce max chunk tokens to be more cautious
	const maxChunkTokens = Math.min(2000, config.llm.maxContextForMessages - systemOverheadTokens);

	logger.info(`Creating chunks with maximum ${maxChunkTokens} tokens each (tiktoken-based counting)...`);

	// First, format all messages and filter out empty ones
	const formattedMessages = messages
		.map(formatter)
		.filter(msg => msg !== null);

	// Then create chunks based on accurate token count
	for (const formattedMsg of formattedMessages) {
		const msgTokens = countTokens(formattedMsg);

		// If adding this message would exceed the chunk limit or chunk getting too big, start a new chunk
		if ((currentTokenCount + msgTokens > maxChunkTokens) && currentChunk.length > 0) {
			chunks.push(currentChunk);
			currentChunk = [];
			currentTokenCount = 0;
		}

		// Add the message to the current chunk
		currentChunk.push(formattedMsg);
		currentTokenCount += msgTokens;

		// Safety check - if this single message is too large, truncate it further
		if (msgTokens > maxChunkTokens * 0.75) {
			logger.warn(`Very large message detected (${msgTokens} tokens). Truncating further.`);
			// Replace the last message with a further truncated version
			currentChunk[currentChunk.length - 1] = formattedMsg.substring(0, Math.floor(maxChunkTokens * 0.5)) + "... [message truncated due to length]";
			// Recalculate token count for the chunk
			currentTokenCount = currentChunk.reduce((sum, msg) => sum + countTokens(msg), 0);
		}
	}

	// Add the last chunk if it has any messages
	if (currentChunk.length > 0) {
		chunks.push(currentChunk);
	}

	return chunks;
}

module.exports = {
	countTokens,
	createTokenBasedChunks
};