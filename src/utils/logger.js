const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
	fs.mkdirSync(logsDir, { recursive: true });
}

// Define log format
const logFormat = winston.format.printf(({ level, message, timestamp }) => {
	return `${timestamp} ${level}: ${message}`;
});

// Create logger
const logger = winston.createLogger({
	level: process.env.LOG_LEVEL || 'info',
	format: winston.format.combine(
		winston.format.timestamp(),
		logFormat
	),
	transports: [
		// Console output
		new winston.transports.Console({
			format: winston.format.combine(
				winston.format.colorize(),
				winston.format.timestamp(),
				logFormat
			)
		}),
		// File output
		new winston.transports.File({
			filename: path.join(logsDir, 'error.log'),
			level: 'error'
		}),
		new winston.transports.File({
			filename: path.join(logsDir, 'combined.log')
		})
	]
});

module.exports = logger;