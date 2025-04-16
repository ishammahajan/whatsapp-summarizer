const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

module.exports = {
	llm: {
		apiUrl: process.env.LM_STUDIO_API_URL || 'http://localhost:1234/v1/chat/completions',
		maxContextTokens: parseInt(process.env.MAX_CONTEXT_TOKENS || '4096'),
		maxContextForMessages: parseInt(process.env.MAX_CONTEXT_FOR_MESSAGES || '3000'),
		maxCompletionTokens: parseInt(process.env.MAX_COMPLETION_TOKENS || '900'),
		temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.1')
	},
	whatsapp: {
		autoSummaryThreshold: parseInt(process.env.AUTO_SUMMARY_THRESHOLD || '250'),
		dataPath: process.env.DATA_PATH || path.join(__dirname, '..', 'data'),
	},
	tokenizer: {
		encoding: process.env.TOKENIZER_ENCODING || 'cl100k_base'
	}
};