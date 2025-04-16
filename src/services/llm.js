const axios = require('axios');
const config = require('../../config/config');
const logger = require('../utils/logger');
const { countTokens } = require('../lib/tokenizer');
const { formatMessageCompact } = require('../lib/formatting');

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
					prompt = `You are analyzing WhatsApp messages from a group conversation.

Summarize ONLY the information explicitly present in these chat messages. Focus on:
- Main topics discussed with DIRECT QUOTES when possible
- Factual information shared by participants (avoid interpretations)
- Questions asked and their exact answers if provided
- Decisions that were explicitly stated
- DO NOT add any information, names, or topics not directly mentioned in the messages

IMPORTANT: When you see [replying to X: "message"] in a message, this indicates the message is a reply to a previous message by user X. Use this reply context to:
- Better understand conversation threads
- Connect related messages even when they're separated by other messages
- Identify question-answer pairs when someone replies to a question
- Follow the flow of discussions on specific topics

If something is unclear or ambiguous, indicate this with phrases like "possibly discussing" or "unclear context about". If you're unsure about a topic or detail, acknowledge the uncertainty rather than guessing.

Format with clear topic headings and bullet points using only information from the chat.

CHAT MESSAGES:
${chatText}

SUMMARY:`;
				} else {
					// Continue with the batch summary - use continuation prompt
					prompt = `Continue analyzing this WhatsApp conversation.

Current summary:
${batchSummary}

CRITICAL INSTRUCTIONS:
- Include ONLY information present in these new messages
- If the new messages contradict the summary, mention both perspectives explicitly
- Use "according to the conversation" instead of assuming facts
- Maintain uncertainty markers like "possibly" or "appears to be" 
- Do not add any details that seem speculative unless directly quoted

Incorporate these additional messages while maintaining the same format and structure:
- Add new topics if they appear
- Expand on previously mentioned topics with new information
- Note any resolution to previously mentioned questions or discussions

ADDITIONAL MESSAGES:
${chatText}

UPDATED SUMMARY:`;
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
							content: 'You are an expert analyst who creates clear, structured summaries of group conversations. ONLY include information explicitly stated in the messages. Do not add any information not directly present in the input.'
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

				const consolidationPrompt = `I have two summaries from different parts of the same WhatsApp conversation. Create a cohesive summary that integrates both.

CRITICAL INSTRUCTIONS:
- Include ONLY information present in either summary
- If the summaries contradict each other, mention both perspectives explicitly
- Use "according to the conversation" instead of assuming facts
- Maintain uncertainty markers like "possibly" or "appears to be" from the original summaries
- Remove any details that seem speculative unless directly quoted

FORMAT REQUIREMENTS:
1. Begin with a high-level overview (2-3 sentences) of CONFIRMED topics only
2. Organize by main discussion topics with clear headings
3. Use bullet points for key points under each topic
4. Highlight any decisions made or action items
5. Maintain chronological flow where relevant

FIRST SUMMARY:
${fullSummary}

SECOND SUMMARY:
${batchSummary}

COMBINED SUMMARY:`;

				const consolidationTokens = countTokens(consolidationPrompt);
				logger.info(`Consolidation prompt tokens: ${consolidationTokens}`);

				// Make API request for consolidation
				const response = await axios.post(config.llm.apiUrl, {
					model: 'local-model',
					messages: [
						{
							role: 'system',
							content: 'You are an expert analyst who creates clear, structured summaries of group conversations. Only include information explicitly stated in the summaries.'
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

			const finalRefinementPrompt = `You're creating a final executive summary of a WhatsApp group conversation.

CRITICAL INSTRUCTIONS:
- Do NOT introduce new information not present in the draft summary
- Maintain all uncertainty markers (like "possibly" or "appears")
- Keep all contradictory perspectives mentioned in the original
- Clearly separate facts from opinions in the conversation

Please refine the following summary into a professional, well-organized report format with:

1. OVERVIEW: A brief introduction and high-level summary (1-2 paragraphs)
2. KEY TOPICS: Main discussion areas with bullet points for important details
3. DECISIONS & ACTION ITEMS: Clear list of any decisions made and actions assigned (if any)
4. NOTABLE MENTIONS: Any important links, events, or references shared in the chat

Keep the tone professional and focus on clarity and readability.

DRAFT SUMMARY:
${fullSummary}

REFINED SUMMARY:`;

			// Make API request for final refinement
			const response = await axios.post(config.llm.apiUrl, {
				model: 'local-model',
				messages: [
					{
						role: 'system',
						content: 'You are an expert analyst who creates clear, structured executive summaries. Only include information explicitly stated in the original summary.'
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