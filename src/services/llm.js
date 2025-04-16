const axios = require('axios');
const config = require('../../config/config');
const logger = require('../utils/logger');
const { countTokens } = require('../lib/tokenizer');
const { formatMessageCompact } = require('../lib/formatting');
const {
	getInitialPrompt,
	getContinuationPrompt,
	getConsolidationPrompt,
	getRefinementPrompt,
	getSummarizationSystemPrompt,
	getConsolidationSystemPrompt,
	getRefinementSystemPrompt
} = require('../prompts');

/**
 * Summarizes chat messages using locally hosted LLM via LMStudio
 * @param {Array} messages - Array of chat message objects
 * @returns {Promise<string>} - Summary of the chat
 */
async function summarizeWithLLM(messages) {
	try {
		// Create token-optimized chunks of messages
		const { createTokenBasedChunks } = require('../lib/tokenizer');
		const messageChunks = createTokenBasedChunks(messages, formatMessageCompact);
		logger.info(`Created ${messageChunks.length} chunks based on token count`);

		// Ensure chunks aren't too big by calculating actual sizes
		for (let i = 0; i < messageChunks.length; i++) {
			const chunk = messageChunks[i];
			const chatText = chunk.join('\n');
			const totalTokens = countTokens(chatText);

			logger.info(`Chunk ${i + 1}: ${totalTokens} tokens, ${chunk.length} messages`);

			// If chunk is still too big, split it in half recursively
			if (totalTokens > 2000) {
				logger.info(`Chunk ${i + 1} is still too large (${totalTokens} tokens). Splitting further...`);
				const midpoint = Math.floor(chunk.length / 2);
				const firstHalf = chunk.slice(0, midpoint);
				const secondHalf = chunk.slice(midpoint);

				messageChunks.splice(i, 1, firstHalf, secondHalf);
				i--; // Process these new chunks again
				continue;
			}
		}

		logger.info(`After optimization: ${messageChunks.length} chunks to process`);

		// Process chunks in batches to prevent context overflow
		const BATCH_SIZE = 2; // Process chunks in batches of 2
		let fullSummary = '';

		// Process chunks in batches
		for (let batchIndex = 0; batchIndex < Math.ceil(messageChunks.length / BATCH_SIZE); batchIndex++) {
			// Get the current batch of chunks
			const startIdx = batchIndex * BATCH_SIZE;
			const endIdx = Math.min(startIdx + BATCH_SIZE, messageChunks.length);
			const currentBatchChunks = messageChunks.slice(startIdx, endIdx);

			logger.info(`\nProcessing batch ${batchIndex + 1} (chunks ${startIdx + 1} to ${endIdx})...`);

			// Process each chunk in the current batch
			let batchSummary = '';

			for (let i = 0; i < currentBatchChunks.length; i++) {
				const chunk = currentBatchChunks[i];
				const chunkIndex = startIdx + i + 1;

				logger.info(`Processing chunk ${chunkIndex}/${messageChunks.length} (${chunk.length} messages)...`);

				// Join the formatted messages
				const chatText = chunk.join('\n');

				// Log token count as a final check
				logger.info(`Sending chunk with exactly ${countTokens(chatText)} tokens`);

				// Improved prompts for better summaries
				let prompt;
				if (i === 0 && batchSummary === '') {
					// First chunk in this batch - use initial prompt
					prompt = getInitialPrompt(chatText);
				} else {
					// Continue with the batch summary - use continuation prompt
					prompt = getContinuationPrompt(batchSummary, chatText);
				}

				// Calculate prompt token count for logging
				const promptTokens = countTokens(prompt);
				logger.info(`Complete prompt token count: ${promptTokens}`);

				// Safety check to avoid context overflow
				if (promptTokens > 3800) {
					logger.warn(`Prompt is too large (${promptTokens} tokens). Creating intermediate summary...`);
					// If we already have a batch summary, we'll consider it complete and move on
					break;
				}

				// Make API request to local LMStudio instance
				const response = await axios.post(config.llm.apiUrl, {
					model: 'local-model',
					messages: [
						{
							role: 'system',
							content: getSummarizationSystemPrompt()
						},
						{ role: 'user', content: prompt }
					],
					temperature: config.llm.temperature,
					max_tokens: config.llm.maxCompletionTokens
				}, {
					headers: {
						'Content-Type': 'application/json'
					}
				});

				// Update the batch summary
				const chunkSummary = response.data.choices[0].message.content;
				batchSummary = i === 0 ? chunkSummary : batchSummary + "\n\n" + chunkSummary;

				// To avoid rate limiting issues with local API
				if (i < currentBatchChunks.length - 1) {
					await new Promise(resolve => setTimeout(resolve, 100));
				}
			}

			// Combine with the full summary
			if (fullSummary === '') {
				fullSummary = batchSummary;
			} else {
				// Create an intermediate consolidation between the previous summary and this batch
				logger.info(`Consolidating batch ${batchIndex + 1} with previous summary...`);

				const consolidationPrompt = getConsolidationPrompt(fullSummary, batchSummary);
				const consolidationTokens = countTokens(consolidationPrompt);
				logger.info(`Consolidation prompt tokens: ${consolidationTokens}`);

				// Make API request for consolidation
				const response = await axios.post(config.llm.apiUrl, {
					model: 'local-model',
					messages: [
						{
							role: 'system',
							content: getConsolidationSystemPrompt()
						},
						{ role: 'user', content: consolidationPrompt }
					],
					temperature: config.llm.temperature,
					max_tokens: config.llm.maxCompletionTokens
				}, {
					headers: {
						'Content-Type': 'application/json'
					}
				});

				fullSummary = response.data.choices[0].message.content;
			}

			// Small delay between batches
			if (batchIndex < Math.ceil(messageChunks.length / BATCH_SIZE) - 1) {
				await new Promise(resolve => setTimeout(resolve, 150));
			}
		}

		// Final refinement for multi-batch summaries (optional)
		if (messageChunks.length > BATCH_SIZE) {
			logger.info("Performing final refinement of summary...");

			const finalRefinementPrompt = getRefinementPrompt(fullSummary);

			// Make API request for final refinement
			const response = await axios.post(config.llm.apiUrl, {
				model: 'local-model',
				messages: [
					{
						role: 'system',
						content: getRefinementSystemPrompt()
					},
					{ role: 'user', content: finalRefinementPrompt }
				],
				temperature: config.llm.temperature,
				max_tokens: config.llm.maxCompletionTokens
			}, {
				headers: {
					'Content-Type': 'application/json'
				}
			});

			fullSummary = response.data.choices[0].message.content;
		}

		return fullSummary;
	} catch (error) {
		logger.error('Error summarizing with LLM:', error.message);
		if (error.response) {
			logger.error('API response error:', error.response.data);
		}
		return 'Failed to generate summary. Please check if LMStudio is running locally on port 1234 or if input is too large for model context.';
	}
}

module.exports = {
	summarizeWithLLM
};