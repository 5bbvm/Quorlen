import { TextWorthinessScorer } from './src/index';
import lexiconData from './src/dictionary.json';

// Initialize the scoring engine with the dictionary configuration
const scorer = new TextWorthinessScorer(lexiconData);

const sampleText = "I finally graduated college today! I'm completely ecstatic, this is a legendary triumph.";

// Score the text deterministically
const score = scorer.score(sampleText);

// Log the generated scoring object to the console
console.log("======================================================");
console.log("📝 Text Worthiness Scoring Result");
console.log("======================================================");
console.log(`Sample Text: "${sampleText}"\n`);
console.log(`Computed Score Object:`);
console.log(JSON.stringify({
    text: sampleText,
    score: Number(score.toFixed(4)),
    tier: score >= 0.7 ? 'critical' : score >= 0.4 ? 'high' : score >= 0.2 ? 'medium' : 'low'
}, null, 2));
console.log("======================================================");
