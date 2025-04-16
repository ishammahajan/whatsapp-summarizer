const logger = require('./utils/logger');
const client = require('./client/whatsapp');
const events = require('./events');
const fs = require('fs');
const path = require('path');

// Ensure data directories exist
const config = require('../config/config');
if (!fs.existsSync(config.whatsapp.dataPath)) {
	fs.mkdirSync(config.whatsapp.dataPath, { recursive: true });
	logger.info(`Created data directory: ${config.whatsapp.dataPath}`);
}

// Initialize events
events.setupEvents();

// Initialize the client
logger.info('Starting WhatsApp Summarizer...');
client.initialize().catch(err => {
	logger.error('Failed to initialize WhatsApp client:', err);
	process.exit(1);
});

// Handle process termination
process.on('SIGINT', async () => {
	logger.info('Received SIGINT. Shutting down...');
	await client.destroy();
	process.exit(0);
});

process.on('SIGTERM', async () => {
	logger.info('Received SIGTERM. Shutting down...');
	await client.destroy();
	process.exit(0);
});

process.on('uncaughtException', (err) => {
	logger.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
	logger.error('Unhandled rejection at:', promise, 'reason:', reason);
});