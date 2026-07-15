import { TextWorthinessScorer } from 'quorlen';
import lexiconData from 'quorlen/dist/dictionary.json';

const scorer = new TextWorthinessScorer(lexiconData as any);
const sampleText = "I finally graduated college today! I'm completely ecstatic, this is a legendary triumph.";
const result = scorer.score(sampleText);

console.log("======================================================");
console.log("📝 Text Worthiness Scoring Result (from package)");
console.log("======================================================");
console.log(`Sample Text: "${sampleText}"\n`);
console.log(`Computed Score Object:`);
console.log(JSON.stringify({
    text: sampleText,
    score: Number(result.score.toFixed(4)),
    lexicon: result.lexicon,
    structure: result.structure,
    hits: result.hits,
    meta: result.meta,
    tier: result.score >= 0.7 ? 'critical' : result.score >= 0.4 ? 'high' : result.score >= 0.2 ? 'medium' : 'low'
}, null, 2));
console.log("======================================================");
