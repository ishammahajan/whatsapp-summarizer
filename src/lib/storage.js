const fs = require('fs');
const path = require('path');
const config = require('../../config/config');
const logger = require('../utils/logger');

/**
 * Ensures the data directory exists
 * @returns {void}
 */
function ensureDataDirectory() {
	if (!fs.existsSync(config.whatsapp.dataPath)) {
		fs.mkdirSync(config.whatsapp.dataPath, { recursive: true });
	}
}

/**
 * Saves messages to a JSON file
 * @param {Array} messages - Array of message objects
 * @param {string} chatId - Chat ID used in filename
 * @returns {string} - Path to the saved file
 */
function saveMessagesToFile(messages, chatId) {
	ensureDataDirectory();
	const fileName = `chat-${chatId.replace(/[^a-z0-9]/gi, '-')}-${Date.now()}.json`;
	const filePath = path.join(config.whatsapp.dataPath, fileName);

	fs.writeFileSync(filePath, JSON.stringify(messages, null, 2));
	logger.info(`Messages saved to ${fileName}`);

	return filePath;
}

/**
 * Saves summary to a text file
 * @param {string} summary - Summary text
 * @param {string} sourcePath - Path to the source file
 * @returns {string} - Path to the saved summary file
 */
function saveSummaryToFile(summary, sourcePath) {
	const summaryFileName = `${path.basename(sourcePath, '.json')}-summary.txt`;
	const summaryPath = path.join(path.dirname(sourcePath), summaryFileName);

	fs.writeFileSync(summaryPath, summary);
	logger.info(`Summary saved to ${summaryFileName}`);

	return summaryPath;
}

/**
 * Loads messages from a JSON file
 * @param {string} filePath - Path to the JSON file
 * @returns {Array} - Array of message objects
 */
function loadMessagesFromFile(filePath) {
	if (!fs.existsSync(filePath)) {
		throw new Error(`File not found: ${filePath}`);
	}

	const fileContent = fs.readFileSync(filePath, 'utf8');
	return JSON.parse(fileContent);
}

module.exports = {
	saveMessagesToFile,
	saveSummaryToFile,
	loadMessagesFromFile
};