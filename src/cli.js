#!/usr/bin/env node

const { program } = require('commander');
const pkg = require('../package.json');
const logger = require('./utils/logger');
const { handleSummarizeFile } = require('./commands/handlers');

program
	.version(pkg.version)
	.description('WhatsApp Summarizer CLI - Summarize WhatsApp chats with LLMs');

// Define commands
program
	.command('summarize <file>')
	.description('Summarize a WhatsApp chat export file')
	.action(async (file) => {
		try {
			logger.info(`Summarizing chat from ${file}...`);
			const result = await handleSummarizeFile(file);
			logger.info(`Summary saved to ${result.summaryPath}`);
			process.exit(0);
		} catch (error) {
			logger.error('Error:', error.message);
			process.exit(1);
		}
	});

program
	.command('start')
	.description('Start the interactive WhatsApp client')
	.action(() => {
		require('./index');
	});

// Parse arguments
program.parse(process.argv);

// If no command is provided, show help
if (!process.argv.slice(2).length) {
	// Default to running the interactive client
	require('./index');
}