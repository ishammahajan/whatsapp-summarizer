/**
 * Initial prompt for summarizing WhatsApp messages
 * @param {string} chatText - The formatted chat messages to summarize
 * @returns {string} - The complete prompt for initial summarization
 */
function getInitialPrompt(chatText) {
	return `You are analyzing WhatsApp messages from a group conversation.

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
}

module.exports = { getInitialPrompt };