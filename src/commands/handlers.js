const logger = require('../utils/logger');
const { formatMessage } = require('../lib/formatting');
const { summarizeWithLLM } = require('../services/llm');
const storage = require('../lib/storage');
const whatsappClient = require('../client/whatsapp');

/**
 * Handle summarize file command
 * @param {string} fileName - Name of the file to summarize
 * @returns {Promise<Object>} - Generated summary and path
 */
async function handleSummarizeFile(fileName) {
	try {
		logger.info(`Summarizing chat from ${fileName}...`);
		const messages = storage.loadMessagesFromFile(fileName);

		// Show info about the messages
		logger.info(`Found ${messages.length} messages from ${new Date(messages[0].timestamp).toLocaleString()} to ${new Date(messages[messages.length - 1].timestamp).toLocaleString()}`);

		// Get summary from LLM
		logger.info('Generating summary with LLM via LMStudio...');
		const summary = await summarizeWithLLM(messages);

		// Handle output
		const summaryPath = storage.saveSummaryToFile(summary, fileName);

		return { summary, summaryPath };
	} catch (error) {
		logger.error('Error processing summarize command:', error.message);
		throw error;
	}
}

/**
 * Handle chat retrieval command
 * @param {string} chatQuery - Chat identifier (index or ID)
 * @param {number} messageCount - Number of messages to retrieve
 * @returns {Promise<Object>} - Retrieved messages and chat info
 */
async function handleChatRetrieval(chatQuery, messageCount = 100) {
	try {
		// Handle numeric index or chat ID
		const chats = await whatsappClient.getChats();
		let targetChat = null;

		if (!isNaN(chatQuery)) {
			// If input is a number, treat as index
			const index = parseInt(chatQuery);
			if (index >= 0 && index < chats.length) {
				targetChat = chats[index];
			}
		} else {
			// Otherwise search by chat ID
			targetChat = chats.find(chat =>
				chat.id._serialized === chatQuery
			);
		}

		if (!targetChat) {
			throw new Error('Chat not found. Please check the chat list and try again.');
		}

		logger.info(`Retrieving ${messageCount} messages from ${targetChat.name} (ID: ${targetChat.id._serialized})...`);

		const messages = await targetChat.fetchMessages({ limit: messageCount });
		logger.info(`Retrieved ${messages.length} messages from "${targetChat.name}"`);

		// Format messages
		const formattedMessages = messages.map(msg => formatMessage(msg));

		// Save messages to file
		const filePath = storage.saveMessagesToFile(formattedMessages, targetChat.id._serialized);

		return {
			chatName: targetChat.name,
			chatId: targetChat.id._serialized,
			messages: formattedMessages,
			filePath
		};
	} catch (error) {
		logger.error('Error retrieving messages:', error.message);
		throw error;
	}
}

/**
 * Handle message summarization
 * @param {Array} messages - Messages to summarize
 * @returns {Promise<string>} - Generated summary
 */
async function handleSummarizeMessages(messages) {
	try {
		logger.info('Generating summary with LLM via LMStudio...');
		const summary = await summarizeWithLLM(messages);
		return summary;
	} catch (error) {
		logger.error('Error generating summary:', error.message);
		throw error;
	}
}

/**
 * List all available chats
 * @returns {Promise<Array>} - Array of chat objects
 */
async function listChats() {
	try {
		const chats = await whatsappClient.getChats();
		return chats.map((chat, index) => ({
			index,
			name: chat.name || 'Unknown',
			id: chat.id._serialized,
			isGroup: chat.isGroup
		}));
	} catch (error) {
		logger.error('Error listing chats:', error.message);
		throw error;
	}
}

/**
 * Handle summary output
 * @param {string} summary - The generated summary
 * @param {string} fileName - Optional filename to save summary to
 * @returns {Object} - Summary and path
 */
function handleSummaryOutput(summary, fileName = null) {
	logger.info('\n===== CHAT SUMMARY =====\n');
	logger.info(summary);
	logger.info('\n========================\n');

	if (fileName) {
		const summaryPath = storage.saveSummaryToFile(summary, fileName);
		return { summary, summaryPath };
	}

	return { summary };
}

module.exports = {
	handleSummarizeFile,
	handleChatRetrieval,
	handleSummarizeMessages,
	listChats,
	handleSummaryOutput
};