const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const readline = require('readline');
const fs = require('fs');
const axios = require('axios');

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
const MAX_COMPLETION_TOKENS = 800; // Maximum tokens to reserve for model completion

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
 * Estimate token count for a string using a more conservative approach
 * Most language models use roughly 1 token per 3 characters for English text
 * @param {string} text - Text to count tokens for
 * @returns {number} - Estimated token count
 */
function estimateTokenCount(text) {
    if (!text) return 0;
    // More conservative estimate: ~3 chars = 1 token (was 4)
    return Math.ceil(text.length / 3);
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

    return `[${timeStr}] ${author}: ${body}`;
}

/**
 * Create chunks of messages based on token count
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

    console.log(`Creating chunks with maximum ${maxChunkTokens} tokens each (conservative estimate)...`);

    // First, format all messages and filter out empty ones
    const formattedMessages = messages
        .map(formatMessageCompact)
        .filter(msg => msg !== null);

    // Then create chunks based on token count
    for (const formattedMsg of formattedMessages) {
        const msgTokens = estimateTokenCount(formattedMsg);

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
            currentTokenCount = currentChunk.reduce((sum, msg) => sum + estimateTokenCount(msg), 0);
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
            const totalTokens = estimateTokenCount(chatText);

            console.log(`Chunk ${i + 1}: Estimated ${totalTokens} tokens, ${chunk.length} messages`);

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

        let fullSummary = '';

        // Process each chunk and build a progressive summary
        for (let i = 0; i < messageChunks.length; i++) {
            const chunk = messageChunks[i];
            const chunkIndex = i + 1;

            console.log(`Processing chunk ${chunkIndex}/${messageChunks.length} (${chunk.length} messages)...`);

            // Join the formatted messages
            const chatText = chunk.join('\n');

            // Log token count as a final check
            console.log(`Sending chunk with approximately ${estimateTokenCount(chatText)} tokens`);

            // Adjust the prompt based on whether this is the first chunk or a follow-up
            let prompt;
            if (i === 0) {
                prompt = `Please provide a concise summary of the following WhatsApp chat messages. Focus on the main topics discussed and key information:

${chatText}

Summary:`;
            } else {
                prompt = `Continue analyzing this WhatsApp conversation. Here is the summary so far:

${fullSummary}

And here are more messages to incorporate:

${chatText}

Updated summary:`;
            }

            // Make API request to local LMStudio instance
            const response = await axios.post(LM_STUDIO_API_URL, {
                model: 'local-model',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a concise summarizer of WhatsApp conversations.'
                    },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.3,
                max_tokens: MAX_COMPLETION_TOKENS
            }, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            // Update the full summary with this chunk's analysis
            const chunkSummary = response.data.choices[0].message.content;
            fullSummary = i === 0 ? chunkSummary : fullSummary + "\n\n" + chunkSummary;

            // To avoid rate limiting issues with local API
            if (i < messageChunks.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        // Final summary refinement if we had multiple chunks
        if (messageChunks.length > 1) {
            console.log("Creating final consolidated summary...");
            const finalPrompt = `Here is a multi-part summary of a WhatsApp conversation. Please consolidate this into a single coherent summary:

${fullSummary}

Consolidated summary:`;

            const finalResponse = await axios.post(LM_STUDIO_API_URL, {
                model: 'local-model',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a concise summarizer of WhatsApp conversations.'
                    },
                    { role: 'user', content: finalPrompt }
                ],
                temperature: 0.3,
                max_tokens: MAX_COMPLETION_TOKENS
            }, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            return finalResponse.data.choices[0].message.content;
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

                    console.log('\n===== CHAT SUMMARY =====\n');
                    console.log(summary);
                    console.log('\n========================\n');

                    // Save summary to file
                    const summaryFileName = `${fileName.replace('.json', '')}-summary.txt`;
                    fs.writeFileSync(summaryFileName, summary);
                    console.log(`Summary saved to ${summaryFileName}`);
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
                const formattedMessages = messages.map(msg => ({
                    timestamp: new Date(msg.timestamp * 1000).toISOString(),
                    from: msg.from,
                    author: msg._data.notifyName || msg.author || 'Unknown',
                    body: msg.body,
                    hasMedia: msg.hasMedia
                }));

                // Save messages to file using chat ID in filename
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

                        console.log('\n===== CHAT SUMMARY =====\n');
                        console.log(summary);
                        console.log('\n========================\n');

                        // Save summary to file
                        const summaryFileName = `${fileName.replace('.json', '')}-summary.txt`;
                        fs.writeFileSync(summaryFileName, summary);
                        console.log(`Summary saved to ${summaryFileName}`);
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
            const formattedMessages = chatMessages.map(msg => ({
                timestamp: new Date(msg.timestamp * 1000).toISOString(),
                from: msg.from,
                author: msg.fromMe ? 'You' : (msg._data.notifyName || msg.author || 'Unknown'), // Better handling of own messages
                body: msg.body,
                hasMedia: msg.hasMedia,
                fromMe: msg.fromMe
            }));

            // Generate summary
            console.log('Generating summary with LMStudio...');
            const summary = await summarizeWithLLM(formattedMessages);

            // Reply with the summary
            await message.reply(`*Chat Summary of ${chatMessages.length} messages*\n\n${summary}`);

            // Also log the summary to console
            console.log('\n===== CHAT SUMMARY =====\n');
            console.log(summary);
            console.log('\n========================\n');

        } catch (error) {
            console.error('Error processing summarize command:', error);
            await message.reply('Sorry, I encountered an error while generating the summary. Please try again later.');
        }
    }
});

// Initialize the client
client.initialize();