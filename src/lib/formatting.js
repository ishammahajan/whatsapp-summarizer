/**
 * Format a message for minimal token usage
 * @param {object} msg - Message object
 * @returns {string} - Formatted message string
 */
function formatMessageCompact(msg) {
	// Skip empty or media-only messages
	if (!msg.body || msg.body.trim() === '' || msg.hasMedia) {
		return null;
	}

	// Format timestamp to be compact
	const date = new Date(msg.timestamp);
	const timeStr = `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;

	// Truncate very long messages
	const maxMsgLength = 200; // Max characters per message
	const body = msg.body.length > maxMsgLength ?
		msg.body.substring(0, maxMsgLength) + '...' :
		msg.body;

	// Extract just the username part before @ if possible
	let author = msg.author;
	if (author && author.includes('@')) {
		author = author.split('@')[0];
	}

	// Add reply context if available
	let replyContext = '';
	if (msg.quotedMsg) {
		// Keep the reply context brief but informative
		const quotedPreview = msg.quotedMsg.body.length > 60 ?
			msg.quotedMsg.body.substring(0, 60) + '...' :
			msg.quotedMsg.body;
		replyContext = ` [replying to ${msg.quotedMsg.author}: "${quotedPreview}"]`;
	}

	return `[${timeStr}] ${author}: ${body}${replyContext}`;
}

/**
 * Format WhatsApp messages consistently for various operations
 * @param {object} msg - Raw WhatsApp message object
 * @param {boolean} isFormatted - Whether this is already a formatted message object
 * @returns {object} - Consistently formatted message object
 */
function formatMessage(msg, isFormatted = false) {
	if (isFormatted) return msg; // Already formatted message

	// Extract quoted message information if available
	let quotedInfo = null;
	if (msg._data && msg._data.quotedMsg) {
		quotedInfo = {
			author: msg._data.quotedMsg.notifyName || 'Unknown',
			body: msg._data.quotedMsg.body || ''
		};
	}

	return {
		timestamp: new Date(msg.timestamp * 1000).toISOString(),
		from: msg.from,
		author: msg.fromMe ? 'You' : (msg._data.notifyName || msg.author || 'Unknown'),
		body: msg.body,
		hasMedia: msg.hasMedia,
		fromMe: msg.fromMe,
		quotedMsg: quotedInfo // Add quoted message info
	};
}

module.exports = {
	formatMessageCompact,
	formatMessage
};