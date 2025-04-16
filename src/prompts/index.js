/**
 * Central export point for all prompt functions
 */

const { getInitialPrompt } = require('./initial');
const { getContinuationPrompt } = require('./continuation');
const { getConsolidationPrompt } = require('./consolidation');
const { getRefinementPrompt } = require('./refinement');
const {
	getSummarizationSystemPrompt,
	getConsolidationSystemPrompt,
	getRefinementSystemPrompt
} = require('./system');

module.exports = {
	getInitialPrompt,
	getContinuationPrompt,
	getConsolidationPrompt,
	getRefinementPrompt,
	getSummarizationSystemPrompt,
	getConsolidationSystemPrompt,
	getRefinementSystemPrompt
};