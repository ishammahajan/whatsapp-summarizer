/**
 * Final refinement prompt for polishing a complete summary
 * @param {string} fullSummary - The complete summary to refine
 * @returns {string} - The complete prompt for final refinement
 */
function getRefinementPrompt(fullSummary) {
	return `You're creating a final executive summary of a WhatsApp group conversation.

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
}

module.exports = { getRefinementPrompt };