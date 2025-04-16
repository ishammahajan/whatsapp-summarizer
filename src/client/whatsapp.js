const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const config = require('../../config/config');
const logger = require('../utils/logger');

// Create a new WhatsApp client
const client = new Client({
	authStrategy: new LocalAuth({
		dataPath: config.whatsapp.dataPath
	}),
	puppeteer: {
		headless: true,
	}
});

// Event handlers for client status
client.on('qr', (qr) => {
	logger.info('QR RECEIVED, scan this with your WhatsApp app:');
	qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
	logger.info('Client authenticated');
});

client.on('auth_failure', (msg) => {
	logger.error('Authentication failure:', msg);
});

module.exports = client;