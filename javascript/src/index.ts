export type IntensityTier = 'critical' | 'high' | 'medium';

export interface LexiconConfig {
    metadata?: {
        suffixes?: string[];
    };
    categories?: Record<string, any>;
}

/**
 * A pure, standalone scoring module with ZERO dependencies.
 *
 * Usage:
 * ```ts
 * import { TextWorthinessScorer } from './index';
 * import lexiconData from './intensity_lexicon.json';
 * 
 * const scorer = new TextWorthinessScorer(lexiconData);
 * const score = scorer.score("This is a fantastic day, truly unforgettable.");
 * console.log(score);
 * ```
 */
export class TextWorthinessScorer {
    private stemMap = new Map<string, IntensityTier>();
    private phraseMap = new Map<string, IntensityTier>();
    private phraseRegex: RegExp | null = null;
    private stemFunc: (word: string) => string;

    // Default English superlative pattern
    private superlativePattern = /\b(best|worst|greatest|most|least|happiest|saddest|proudest|hardest|biggest|first ever|never felt|nothing like|ever had)\b/i;

    constructor(config: LexiconConfig) {
        // Initialization parses the config precisely once for optimal execution loops
        this.stemFunc = this.createStemmer(config.metadata?.suffixes || []);
        this.parseLexicon(config);
    }

    private createStemmer(suffixes: string[]): (word: string) => string {
        const sortedSuffixes = [...suffixes].sort((a, b) => b.length - a.length);

        return (word: string): string => {
            let w = word.toLowerCase();

            // Special morphological rule for English -ied -> y
            if (w.endsWith("ied") && w.length > 4) {
                return w.slice(0, -3) + "y";
            }

            for (const suf of sortedSuffixes) {
                if (w.endsWith(suf) && w.length - suf.length >= 3) {
                    w = w.slice(0, -suf.length);
                    break;
                }
            }
            return w;
        };
    }

    private parseLexicon(jsonData: LexiconConfig) {
        const critical = new Set<string>();
        const high = new Set<string>();
        const medium = new Set<string>();

        const categories = jsonData.categories || {};

        for (const catKey in categories) {
            const cat = categories[catKey];

            // Handle Variant A: weight_groups
            if (cat.weight_groups) {
                if (cat.weight_groups.critical) cat.weight_groups.critical.forEach((w: string) => critical.add(w));
                if (cat.weight_groups.high) cat.weight_groups.high.forEach((w: string) => high.add(w));
                if (cat.weight_groups.medium) cat.weight_groups.medium.forEach((w: string) => medium.add(w));
            }

            // Handle Variant B: weight + words
            if (cat.weight && cat.words) {
                const weight = cat.weight as IntensityTier;
                cat.words.forEach((w: string) => {
                    if (weight === 'critical') critical.add(w);
                    else if (weight === 'high') high.add(w);
                    else if (weight === 'medium') medium.add(w);
                });
            }
        }

        const addSet = (wordSet: Set<string>, tier: IntensityTier) => {
            wordSet.forEach(word => {
                const w = word.toLowerCase();
                if (w.includes(' ') || w.includes('-')) {
                    const existing = this.phraseMap.get(w);
                    if (!existing || (tier === 'critical') || (tier === 'high' && existing === 'medium')) {
                        this.phraseMap.set(w, tier);
                    }
                } else {
                    const stem = this.stemFunc(word);
                    const existing = this.stemMap.get(stem);
                    if (!existing || (tier === 'critical') || (tier === 'high' && existing === 'medium')) {
                        this.stemMap.set(stem, tier);
                    }

                    const exactExisting = this.stemMap.get(word);
                    if (!exactExisting || (tier === 'critical') || (tier === 'high' && exactExisting === 'medium')) {
                        this.stemMap.set(word, tier);
                    }
                }
            });
        };

        addSet(medium, 'medium');
        addSet(high, 'high');
        addSet(critical, 'critical');

        this.phraseRegex = this.buildPhraseRegex(this.phraseMap);
    }

    private buildPhraseRegex(phraseMap: Map<string, IntensityTier>): RegExp | null {
        const phrases = Array.from(phraseMap.keys());
        if (phrases.length === 0) return null;

        phrases.sort((a, b) => b.length - a.length);

        const escaped = phrases.map(p => {
            const strictEscaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return strictEscaped.replace(/(\\?-|\s)+/g, '[\\s\\-]+');
        });
        return new RegExp(`(?<=^|[^\\p{L}])(${escaped.join('|')})(?=[^\\p{L}]|$)`, 'giu');
    }

    /**
     * Completely deterministic scoring mechanism.
     * Takes raw text and returns computed score between 0 and 1.
     * 
     * @param text string The raw text to process
     * @returns number The total computed score
     */
    public score(text: string): number {
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            return 0;
        }

        const lowerText = text.toLowerCase();
        const wordsRaw = lowerText.match(/\p{L}+/gu) || [];
        const wordCount = wordsRaw.length;
        const charCount = text.length;

        if (wordCount === 0) {
            return 0;
        }

        // ==========================================
        // COMPONENT 1: LEXICON SCORING (~70% weight)
        // ==========================================
        let criticalHits = 0, highHits = 0, mediumHits = 0;
        const hitWords = new Set<string>();
        let processedText = lowerText;

        if (this.phraseRegex) {
            // requires polyfill or modern JS target for .matchAll
            const phraseMatches = lowerText.matchAll(this.phraseRegex);
            for (const match of phraseMatches) {
                const phrase = match[0].toLowerCase().replace(/[\s\-]+/g, ' ');
                const tier = this.phraseMap.get(phrase);
                if (tier && !hitWords.has(phrase)) {
                    hitWords.add(phrase);
                    if (tier === 'critical') criticalHits++;
                    else if (tier === 'high') highHits++;
                    else if (tier === 'medium') mediumHits++;
                }
            }
            // Erase matched phrases
            processedText = lowerText.replace(this.phraseRegex, (match) => ' '.repeat(match.length));
        }

        const erasedWordsRaw = processedText.match(/\p{L}+/gu) || [];
        for (const rawWord of erasedWordsRaw) {
            const stem = this.stemFunc(rawWord);
            const tier = this.stemMap.get(stem) || this.stemMap.get(rawWord);

            if (tier) {
                if (!hitWords.has(stem)) {
                    hitWords.add(stem);
                    if (tier === 'critical') criticalHits++;
                    else if (tier === 'high') highHits++;
                    else if (tier === 'medium') mediumHits++;
                }
            }
        }

        let lexiconScore = (criticalHits * 0.5) + (highHits * 0.3);
        let mediumScore = mediumHits * 0.1;

        if (criticalHits === 0 && highHits === 0) {
            mediumScore = Math.min(mediumScore, 0.25);
        }

        lexiconScore += mediumScore;

        const superlativeMatches = (text.match(this.superlativePattern) || []).length;
        if (superlativeMatches > 0) {
            lexiconScore += 0.20;
        }

        const exclamationCount = (text.match(/!/g) || []).length;
        if (exclamationCount > 0) {
            lexiconScore += 0.15;
        }

        lexiconScore = Math.min(1.0, lexiconScore);

        // ==========================================
        // COMPONENT 2: TEXT LENGTH / STYLE (~30% weight)
        // ==========================================
        let lengthScore = 0;

        if (charCount >= 300) lengthScore += 0.30;
        else if (charCount >= 150) lengthScore += 0.20;
        else if (charCount >= 60) lengthScore += 0.10;

        const sentenceCount = text.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
        const avgWordsPerSentence = wordCount / Math.max(sentenceCount, 1);
        if (avgWordsPerSentence > 4) lengthScore += 0.15;
        if (sentenceCount > 1) lengthScore += 0.15;

        const hasNumbers = /\d/.test(text);
        const hasProperNouns = /[^.!?¡¿]\s+[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ]{2,}/u.test(text);
        const hasPunctuation = /[?…]/.test(text);
        const hasQuotes = /["']/.test(text);

        if (hasNumbers) lengthScore += 0.10;
        if (hasProperNouns) lengthScore += 0.10;
        if (hasPunctuation) lengthScore += 0.10;
        if (hasQuotes) lengthScore += 0.10;

        // ==========================================
        // FINAL BLEND
        // ==========================================
        const lexicalWeight = lexiconScore >= 0.3 ? 0.70 : 0.60;
        const styleWeight = 1.0 - lexicalWeight;

        let totalScore = (lexiconScore * lexicalWeight) + (lengthScore * styleWeight);

        // Soft length penalties
        if (lexiconScore < 0.25) {
            if (wordCount < 5) {
                totalScore = Math.min(totalScore, 0.10);
            } else if (wordCount < 10) {
                totalScore = Math.min(totalScore, 0.20);
            } else if (wordCount < 15) {
                totalScore = Math.min(totalScore, 0.28);
            }
        }

        return Math.min(Math.max(totalScore, 0), 1);
    }
}
