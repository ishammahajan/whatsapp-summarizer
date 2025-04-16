const client = require('./client/whatsapp');
const config = require('../config/config');
const logger = require('./utils/logger');
const { formatMessage } = require('./lib/formatting');
const { summarizeWithLLM } = require('./services/llm');
const commands = require('./commands');

// Auto-summarization message counters
const messageCounters = {};

// Register client events
function setupEvents() {
	// Ready event
	client.on('ready', async () => {
		logger.info('Client is ready!');

		// List all chats for reference
		const chats = await client.getChats();
		logger.info('\nYour chats:');
		chats.forEach((chat, index) => {
			logger.info(`${index}: ${chat.name || 'Unknown'} | ID: ${chat.id._serialized}`);
		});

		commands.displayHelp();
		commands.promptUser();
	});

	// Message handler
	client.on('message_create', async (message) => {
		logger.info(`Message received: ${message.body}`);

		// Increment message counter for the chat
		const chatId = message.from;
		logger.debug(`Message counter for chat ${chatId}: ${messageCounters[chatId] || 0}`);

		if (!messageCounters[chatId]) {
			messageCounters[chatId] = 0;
		}
		messageCounters[chatId]++;

		// Check if auto-summarization is triggered
		if (messageCounters[chatId] >= config.whatsapp.autoSummaryThreshold) {
			logger.info(`Auto-summarization triggered for chat: ${chatId}`);
			messageCounters[chatId] = 0; // Reset counter

			try {
				const chat = await message.getChat();
				const chatMessages = await chat.fetchMessages({ limit: config.whatsapp.autoSummaryThreshold });
				const formattedMessages = chatMessages.map(msg => formatMessage(msg));

				logger.info('Generating auto-summary...');
				const summary = await summarizeWithLLM(formattedMessages);
				await chat.sendMessage(`*Auto-Generated Summary of Last ${config.whatsapp.autoSummaryThreshold} Messages:*\n\n${summary}`);
				logger.info('Auto-summary sent to chat');
			} catch (error) {
				logger.error('Error during auto-summarization:', error);
			}
		}

		// Handle summarize command
		if (message.body.toLowerCase().startsWith('!summarize')) {
			try {
				// Parse command to check for message count
				const commandParts = message.body.trim().split(/\s+/);
				// Default to 100 messages if no number specified
				let messageCount = 100;

				// If there's a second part and it's a number, use it as the message count
				if (commandParts.length > 1 && !isNaN(commandParts[1])) {
					messageCount = parseInt(commandParts[1]);
					// Ensure reasonable limits
					if (messageCount <= 0) messageCount = 1;
					if (messageCount > 1000) messageCount = 1000; // Set a reasonable upper limit
				}

				// Get the chat where this message was sent
				const chat = await message.getChat();
				logger.info(`Summarize command received in chat: ${chat.name || 'Unknown'} (${chat.id._serialized})`);

				// Send acknowledgement with the actual count
				await message.reply(`Generating summary of the last ${messageCount} messages... This might take a moment.`);

				// Fetch specified number of messages from the chat
				const chatMessages = await chat.fetchMessages({ limit: messageCount });
				logger.info(`Retrieved ${chatMessages.length} messages for summarization`);

				// Format messages for summarization
				const formattedMessages = chatMessages.map(msg => formatMessage(msg));

				// Generate summary
				logger.info('Generating summary with LMStudio...');
				const summary = await summarizeWithLLM(formattedMessages);

				// Reply with the summary
				await message.reply(`*Chat Summary of ${chatMessages.length} messages*\n\n${summary}`);
				logger.info('Summary sent to chat');

			} catch (error) {
				logger.error('Error processing summarize command:', error);
				await message.reply('Sorry, I encountered an error while generating the summary. Please try again later.');
			}
		}
	});
}

module.exports = { setupEvents };