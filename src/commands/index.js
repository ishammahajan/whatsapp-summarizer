const readline = require('readline');
const logger = require('../utils/logger');
const handlers = require('./handlers');

// Create readline interface
const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout
});

/**
 * Process user commands from CLI
 * @param {string} input - User input
 * @returns {Promise<void>}
 */
async function processCommand(input) {
	if (input.toLowerCase() === 'exit') {
		logger.info('Exiting WhatsApp Summarizer...');
		rl.close();
		process.exit(0);
		return;
	}

	// Handle summarize command
	if (input.toLowerCase().startsWith('summarize ')) {
		const fileName = input.substring('summarize '.length).trim();

		try {
			const result = await handlers.handleSummarizeFile(fileName);
			handlers.handleSummaryOutput(result.summary, result.summaryPath);
		} catch (error) {
			logger.error(`Command failed: ${error.message}`);
		}

		return;
	}

	// Handle chat fetch command
	try {
		const parts = input.split(' ');
		let messageCount = 100; // Default message count

		// Check if the last part is a number (message count)
		if (parts.length > 1 && !isNaN(parts[parts.length - 1])) {
			messageCount = parseInt(parts.pop());
		}

		const chatQuery = parts.join(' ').trim();

		if (!chatQuery) {
			// If no chat query is provided, show the list of chats
			const chats = await handlers.listChats();
			logger.info('\nYour chats:');
			chats.forEach(chat => {
				logger.info(`${chat.index}: ${chat.name} | ID: ${chat.id}${chat.isGroup ? ' (Group)' : ''}`);
			});
			return;
		}

		const result = await handlers.handleChatRetrieval(chatQuery, messageCount);

		// Print sample of messages
		logger.info('\nSample of retrieved messages:');
		result.messages.slice(0, 5).forEach((msg) => {
			logger.info(`[${msg.timestamp}] ${msg.author}: ${msg.body.substring(0, 50)}${msg.body.length > 50 ? '...' : ''}`);
		});

		// Ask if user wants to summarize these messages
		rl.question('Do you want to summarize these messages? (y/n): ', async (answer) => {
			if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
				try {
					const summary = await handlers.handleSummarizeMessages(result.messages);
					handlers.handleSummaryOutput(summary, result.filePath);
				} catch (error) {
					logger.error(`Summarization failed: ${error.message}`);
				}
			}
			promptUser();
		});
		return;

	} catch (error) {
		logger.error(`Command failed: ${error.message}`);
	}

	// Continue listening for input unless exit was called
	promptUser();
}

/**
 * Prompt for user input
 */
function promptUser() {
	rl.question('> ', async (input) => {
		await processCommand(input);
	});
}

/**
 * Display help information
 */
function displayHelp() {
	logger.info('\nCommands:');
	logger.info('- To fetch messages: [chat ID/index] [number of messages (default: 100)]');
	logger.info('  Example: "12345678901@c.us" 50');
	logger.info('  Example: "0" 50 (using index)');
	logger.info('- To summarize a chat file: summarize [filename]');
	logger.info('  Example: summarize chat-SPJIMR-Converts-1744187783291.json');
	logger.info('- To list all chats: (just press Enter with no input)');
	logger.info('- To exit: exit');
}

module.exports = {
	promptUser,
	displayHelp,
	rl
};