const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const readline = require('readline');
const fs = require('fs');
const axios = require('axios');
const tiktoken = require('tiktoken');

// Create a new WhatsApp client
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
    }
});

// LMStudio API configuration
const LM_STUDIO_API_URL = 'http://localhost:1234/v1/chat/completions';

// Context window settings
const MAX_CONTEXT_TOKENS = 4096;
const MAX_CONTEXT_FOR_MESSAGES = 3000; // Reserve some tokens for system prompt and response
const MAX_COMPLETION_TOKENS = 900; // Maximum tokens to reserve for model completion

// Auto-summarization configuration
const AUTO_SUMMARY_THRESHOLD = 250; // Trigger summary every 500 messages
const messageCounters = {}; // Track message count by chat ID

// Create the tokenizer - using cl100k_base which is used by many modern LLMs
const encoder = tiktoken.get_encoding("cl100k_base");

// Create readline interface for terminal input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Generate QR code for authentication
client.on('qr', (qr) => {
    console.log('QR RECEIVED, scan this with your WhatsApp app:');
    qrcode.generate(qr, { small: true });
});

// Client is ready
client.on('ready', async () => {
    console.log('Client is ready!');

    // List all chats for reference
    const chats = await client.getChats();
    console.log('\nYour chats:');
    chats.forEach((chat, index) => {
        console.log(`${index}: ${chat.name || 'Unknown'} | ID: ${chat.id._serialized}`);
    });

    console.log('\nCommands:');
    console.log('- To fetch messages: [chat ID/index] [number of messages (default: 100)]');
    console.log('  Example: "12345678901@c.us" 50');
    console.log('  Example: "0" 50 (using index)');
    console.log('- To summarize a chat file: summarize [filename]');
    console.log('  Example: summarize chat-SPJIMR-Converts-1744187783291.json');
    console.log('- To exit: exit');

    // Start listening for user input
    promptUser();
});

/**
 * Count tokens accurately using tiktoken
 * @param {string} text - Text to count tokens for
 * @returns {number} - Actual token count
 */
function countTokens(text) {
    if (!text) return 0;
    const tokens = encoder.encode(text);
    return tokens.length;
}

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

/**
 * Handle common summarization output operations
 * @param {string} summary - The generated summary
 * @param {string} fileName - Optional filename to save summary to
 * @param {boolean} logToConsole - Whether to log the summary to console
 * @returns {string} - The summary text
 */
function handleSummaryOutput(summary, fileName = null, logToConsole = true) {
    if (logToConsole) {
        console.log('\n===== CHAT SUMMARY =====\n');
        console.log(summary);
        console.log('\n========================\n');
    }

    if (fileName) {
        const summaryFileName = `${fileName.replace('.json', '')}-summary.txt`;
        fs.writeFileSync(summaryFileName, summary);
        console.log(`Summary saved to ${summaryFileName}`);
    }

    return summary;
}

/**
 * Create chunks of messages based on token count using tiktoken
 * @param {Array} messages - Array of message objects
 * @returns {Array} - Array of chunks, where each chunk is an array of formatted message strings
 */
function createTokenBasedChunks(messages) {
    const chunks = [];
    let currentChunk = [];
    let currentTokenCount = 0;

    // Increase system overhead to be more conservative
    const systemOverheadTokens = 500;  // Was 250, increased to account for prompt formatting
    // Reduce max chunk tokens to be more cautious
    const maxChunkTokens = Math.min(2000, MAX_CONTEXT_FOR_MESSAGES - systemOverheadTokens);

    console.log(`Creating chunks with maximum ${maxChunkTokens} tokens each (tiktoken-based counting)...`);

    // First, format all messages and filter out empty ones
    const formattedMessages = messages
        .map(formatMessageCompact)
        .filter(msg => msg !== null);

    // Then create chunks based on accurate token count
    for (const formattedMsg of formattedMessages) {
        const msgTokens = countTokens(formattedMsg);

        // If adding this message would exceed the chunk limit or chunk getting too big, start a new chunk
        if ((currentTokenCount + msgTokens > maxChunkTokens) && currentChunk.length > 0) {
            chunks.push(currentChunk);
            currentChunk = [];
            currentTokenCount = 0;
        }

        // Add the message to the current chunk
        currentChunk.push(formattedMsg);
        currentTokenCount += msgTokens;

        // Safety check - if this single message is too large, truncate it further
        if (msgTokens > maxChunkTokens * 0.75) {
            console.warn(`Warning: Very large message detected (${msgTokens} tokens). Truncating further.`);
            // Replace the last message with a further truncated version
            currentChunk[currentChunk.length - 1] = formattedMsg.substring(0, Math.floor(maxChunkTokens * 0.5)) + "... [message truncated due to length]";
            // Recalculate token count for the chunk
            currentTokenCount = currentChunk.reduce((sum, msg) => sum + countTokens(msg), 0);
        }
    }

    // Add the last chunk if it has any messages
    if (currentChunk.length > 0) {
        chunks.push(currentChunk);
    }

    return chunks;
}

/**
 * Summarizes chat messages using locally hosted LLM via LMStudio
 * @param {Array} messages - Array of chat message objects
 * @returns {Promise<string>} - Summary of the chat
 */
async function summarizeWithLLM(messages) {
    try {
        // Create token-optimized chunks of messages
        const messageChunks = createTokenBasedChunks(messages);
        console.log(`Created ${messageChunks.length} chunks based on token count`);

        // Ensure chunks aren't too big by calculating actual sizes
        for (let i = 0; i < messageChunks.length; i++) {
            const chunk = messageChunks[i];
            const chatText = chunk.join('\n');
            const totalTokens = countTokens(chatText);

            console.log(`Chunk ${i + 1}: ${totalTokens} tokens, ${chunk.length} messages`);

            // If chunk is still too big, split it in half recursively
            if (totalTokens > 2000) {
                console.log(`Chunk ${i + 1} is still too large (${totalTokens} tokens). Splitting further...`);
                const midpoint = Math.floor(chunk.length / 2);
                const firstHalf = chunk.slice(0, midpoint);
                const secondHalf = chunk.slice(midpoint);

                messageChunks.splice(i, 1, firstHalf, secondHalf);
                i--; // Process these new chunks again
                continue;
            }
        }

        console.log(`After optimization: ${messageChunks.length} chunks to process`);

        // Process chunks in batches to prevent context overflow
        const BATCH_SIZE = 2; // Process chunks in batches of 2
        let fullSummary = '';

        // Process chunks in batches
        for (let batchIndex = 0; batchIndex < Math.ceil(messageChunks.length / BATCH_SIZE); batchIndex++) {
            // Get the current batch of chunks
            const startIdx = batchIndex * BATCH_SIZE;
            const endIdx = Math.min(startIdx + BATCH_SIZE, messageChunks.length);
            const currentBatchChunks = messageChunks.slice(startIdx, endIdx);

            console.log(`\nProcessing batch ${batchIndex + 1} (chunks ${startIdx + 1} to ${endIdx})...`);

            // Process each chunk in the current batch
            let batchSummary = '';

            for (let i = 0; i < currentBatchChunks.length; i++) {
                const chunk = currentBatchChunks[i];
                const chunkIndex = startIdx + i + 1;

                console.log(`Processing chunk ${chunkIndex}/${messageChunks.length} (${chunk.length} messages)...`);

                // Join the formatted messages
                const chatText = chunk.join('\n');

                // Log token count as a final check
                console.log(`Sending chunk with exactly ${countTokens(chatText)} tokens`);

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
                console.log(`Complete prompt token count: ${promptTokens}`);

                // Safety check to avoid context overflow
                if (promptTokens > 3800) {
                    console.log(`Warning: Prompt is too large (${promptTokens} tokens). Creating intermediate summary...`);
                    // If we already have a batch summary, we'll consider it complete and move on
                    break;
                }

                // Make API request to local LMStudio instance
                const response = await axios.post(LM_STUDIO_API_URL, {
                    model: 'local-model',
                    messages: [
                        {
                            role: 'system',
                            content: 'You are an expert analyst who creates clear, structured summaries of group conversations. ONLY include information explicitly stated in the messages. Do not add any information not directly present in the input.'
                        },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.1, // Lower temperature for more conservative outputs
                    max_tokens: MAX_COMPLETION_TOKENS
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
                console.log(`Consolidating batch ${batchIndex + 1} with previous summary...`);

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
                console.log(`Consolidation prompt tokens: ${consolidationTokens}`);

                // Make API request for consolidation
                const response = await axios.post(LM_STUDIO_API_URL, {
                    model: 'local-model',
                    messages: [
                        {
                            role: 'system',
                            content: 'You are an expert analyst who creates clear, structured summaries of group conversations. Only include information explicitly stated in the summaries.'
                        },
                        { role: 'user', content: consolidationPrompt }
                    ],
                    temperature: 0.1, // Lower temperature for more factual outputs
                    max_tokens: MAX_COMPLETION_TOKENS
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
            console.log("Performing final refinement of summary...");

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
            const response = await axios.post(LM_STUDIO_API_URL, {
                model: 'local-model',
                messages: [
                    {
                        role: 'system',
                        content: 'You are an expert analyst who creates clear, structured executive summaries. Only include information explicitly stated in the original summary.'
                    },
                    { role: 'user', content: finalRefinementPrompt }
                ],
                temperature: 0.1, // Lower temperature for more accurate outputs
                max_tokens: MAX_COMPLETION_TOKENS
            }, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            fullSummary = response.data.choices[0].message.content;
        }

        return fullSummary;
    } catch (error) {
        console.error('Error summarizing with LLM:', error.message);
        if (error.response) {
            console.error('API response error:', error.response.data);
        }
        return 'Failed to generate summary. Please check if LMStudio is running locally on port 1234 or if input is too large for model context.';
    }
}

function promptUser() {
    rl.question('> ', async (input) => {
        if (input.toLowerCase() === 'exit') {
            rl.close();
            process.exit(0);
            return;
        }

        // Handle summarize command
        if (input.toLowerCase().startsWith('summarize ')) {
            const fileName = input.substring('summarize '.length).trim();

            try {
                // Check if file exists
                if (!fs.existsSync(fileName)) {
                    console.log(`File not found: ${fileName}`);
                } else {
                    console.log(`Summarizing chat from ${fileName}...`);
                    const fileContent = fs.readFileSync(fileName, 'utf8');
                    const messages = JSON.parse(fileContent);

                    // Show info about the messages
                    console.log(`Found ${messages.length} messages from ${new Date(messages[0].timestamp).toLocaleString()} to ${new Date(messages[messages.length - 1].timestamp).toLocaleString()}`);

                    // Get summary from LLM
                    console.log('Generating summary with LLM via LMStudio...');
                    const summary = await summarizeWithLLM(messages);

                    handleSummaryOutput(summary, fileName);
                }
            } catch (error) {
                console.error('Error processing summarize command:', error.message);
            }

            promptUser();
            return;
        }

        // Handle chat fetch command (existing functionality)
        try {
            const parts = input.split(' ');
            let messageCount = 100; // Default message count

            // Check if the last part is a number (message count)
            if (parts.length > 1 && !isNaN(parts[parts.length - 1])) {
                messageCount = parseInt(parts.pop());
            }

            const chatQuery = parts.join(' ').trim();

            // Handle numeric index or chat ID
            const chats = await client.getChats();
            let targetChat = null;

            if (!isNaN(chatQuery)) {
                // If input is a number, treat as index
                const index = parseInt(chatQuery);
                if (index >= 0 && index < chats.length) {
                    targetChat = chats[index];
                }
            } else {
                // Otherwise search by chat ID
                targetChat = chats.find(chat =>
                    chat.id._serialized === chatQuery
                );
            }

            if (targetChat) {
                console.log(`Retrieving ${messageCount} messages from ${targetChat.name} (ID: ${targetChat.id._serialized})...`);

                const messages = await targetChat.fetchMessages({ limit: messageCount });
                console.log(`Retrieved ${messages.length} messages from "${targetChat.name}"`);

                // Format and save messages to file
                const formattedMessages = messages.map(msg => formatMessage(msg));
                const fileName = `chat-${targetChat.id._serialized.replace(/[^a-z0-9]/gi, '-')}-${Date.now()}.json`;
                fs.writeFileSync(fileName, JSON.stringify(formattedMessages, null, 2));
                console.log(`Messages saved to ${fileName}`);

                // Print sample of messages
                console.log('\nSample of retrieved messages:');
                formattedMessages.slice(0, 5).forEach((msg, i) => {
                    console.log(`[${msg.timestamp}] ${msg.author}: ${msg.body.substring(0, 50)}${msg.body.length > 50 ? '...' : ''}`);
                });

                // Ask if user wants to summarize these messages
                rl.question('Do you want to summarize these messages? (y/n): ', async (answer) => {
                    if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
                        console.log('Generating summary with LLM via LMStudio...');
                        const summary = await summarizeWithLLM(formattedMessages);

                        handleSummaryOutput(summary, fileName);
                    }
                    promptUser();
                });
                return;
            } else {
                console.log('Chat not found. Please check the chat list and try again.');
            }
        } catch (error) {
            console.error('Error retrieving messages:', error);
        }

        // Continue listening for input
        promptUser();
    });
}

// Message handler
client.on('message_create', async (message) => {
    console.log(`Message received: ${message.body}`);

    // Increment message counter for the chat
    const chatId = message.from;
    console.log(`Message counter for chat ${chatId}: ${messageCounters[chatId] || 0}`);
    if (!messageCounters[chatId]) {
        messageCounters[chatId] = 0;
    }
    messageCounters[chatId]++;

    // Check if auto-summarization is triggered
    if (messageCounters[chatId] >= AUTO_SUMMARY_THRESHOLD) {
        console.log(`Auto-summarization triggered for chat: ${chatId}`);
        messageCounters[chatId] = 0; // Reset counter

        try {
            const chat = await message.getChat();
            const chatMessages = await chat.fetchMessages({ limit: AUTO_SUMMARY_THRESHOLD });
            const formattedMessages = chatMessages.map(msg => formatMessage(msg));

            const summary = await summarizeWithLLM(formattedMessages);
            await chat.sendMessage(`*Auto-Generated Summary of Last ${AUTO_SUMMARY_THRESHOLD} Messages:*\n\n${summary}`);
        } catch (error) {
            console.error('Error during auto-summarization:', error);
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
            console.log(`Summarize command received in chat: ${chat.name || 'Unknown'} (${chat.id._serialized})`);

            // Send acknowledgement with the actual count
            await message.reply(`Generating summary of the last ${messageCount} messages... This might take a moment.`);

            // Fetch specified number of messages from the chat
            const chatMessages = await chat.fetchMessages({ limit: messageCount });
            console.log(`Retrieved ${chatMessages.length} messages for summarization`);

            // Format messages for summarization
            const formattedMessages = chatMessages.map(msg => formatMessage(msg));

            // Generate summary
            console.log('Generating summary with LMStudio...');
            const summary = await summarizeWithLLM(formattedMessages);

            // Reply with the summary
            await message.reply(`*Chat Summary of ${chatMessages.length} messages*\n\n${summary}`);

            // Also log the summary to console
            handleSummaryOutput(summary);

        } catch (error) {
            console.error('Error processing summarize command:', error);
            await message.reply('Sorry, I encountered an error while generating the summary. Please try again later.');
        }
    }
});

// Initialize the client
client.initialize();