import { LexiconConfig, NarvoOptions, NarvoResult, IntensityTier } from './types';

export { LexiconConfig, NarvoOptions, NarvoResult, IntensityTier } from './types';

// Deterministic text significance and intensity evaluator.
export class TextWorthinessScorer {
    private stemMap = new Map<string, IntensityTier>();
    private phraseMap = new Map<string, IntensityTier>();
    private phraseRegex: RegExp | null = null;
    private stemFunc: (word: string) => string;

    // Maps each stem back to its original dictionary word for human-readable hit output
    private stemToOriginal = new Map<string, string>();
    private superlativePattern: RegExp | null = null;
    private experientialPattern: RegExp | null = null;
    private negators = new Set<string>();
    private alpha: number = 4.0;

    constructor(config: LexiconConfig, options: NarvoOptions = {}) {
        if (config.metadata?.alpha !== undefined) this.alpha = config.metadata.alpha;
        if (options.alpha !== undefined) this.alpha = options.alpha;

        if (config.metadata?.negators) {
            for (const n of config.metadata.negators) {
                const lower = n.toLowerCase();
                this.negators.add(lower);

                // Track split contraction forms (e.g. "don't" -> "don" and "t")
                if (lower.includes("'")) {
                    const parts = lower.split("'");
                    if (parts.length === 2 && parts[1] === 't') {
                        this.negators.add(parts[0]);
                    }
                }
            }
        }

        this.stemFunc = this.createStemmer(config.metadata?.suffixes || []);
        this.parseLexicon(config);

        if (config.amplifier_patterns?.superlatives && config.amplifier_patterns.superlatives.length > 0) {
            const escaped = config.amplifier_patterns.superlatives.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
            this.superlativePattern = new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');
        }

        if (config.amplifier_patterns?.experiential && config.amplifier_patterns.experiential.length > 0) {
            const escaped = config.amplifier_patterns.experiential.map(s =>
                s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
            );
            this.experientialPattern = new RegExp(`(?<=^|[^\\p{L}])(${escaped.join('|')})(?=[^\\p{L}]|$)`, 'giu');
        }
    }

    // Morphological stemmer

    private createStemmer(suffixes: string[]): (word: string) => string {
        const sortedSuffixes = [...suffixes].sort((a, b) => b.length - a.length);
        const isVowel = (c: string) => 'aeiou'.includes(c);
        const isConsonant = (c: string) => c >= 'a' && c <= 'z' && !isVowel(c);

        return (word: string): string => {
            let w = word.toLowerCase();

            // Suffix transforms
            if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y';
            if (w.endsWith('ied') && w.length > 4) return w.slice(0, -3) + 'y';
            if (w.endsWith('ying') && w.length > 4) {
                const base = w.slice(0, -4);
                if (base.length >= 2) return base + 'y';
            }

            for (const suf of sortedSuffixes) {
                if (w.endsWith(suf) && w.length - suf.length >= 3) {
                    const base = w.slice(0, -suf.length);

                    // Consonant doubling (e.g. running -> run)
                    if (base.length >= 3
                        && base[base.length - 1] === base[base.length - 2]
                        && isConsonant(base[base.length - 1])
                        && !['s', 'l', 'f', 'z'].includes(base[base.length - 1])) {
                        return base.slice(0, -1);
                    }

                    // Silent-e restoration (e.g. hoping -> hope)
                    if ((suf === 'ing' || suf === 'ed') && base.length >= 3) {
                        const lastChar = base[base.length - 1];
                        const secondLast = base[base.length - 2];
                        const thirdLast = base[base.length - 3];
                        if (isConsonant(lastChar)
                            && isVowel(secondLast)
                            && isConsonant(thirdLast)
                            && !['w', 'x', 'y'].includes(lastChar)) {
                            return base + 'e';
                        }
                    }

                    return base;
                }
            }
            return w;
        };
    }

    // Build search maps from the lexicon config
    private parseLexicon(jsonData: LexiconConfig): void {
        const critical = new Set<string>();
        const high = new Set<string>();
        const medium = new Set<string>();
        const categories = jsonData.categories || {};

        for (const catKey in categories) {
            const cat = categories[catKey];

            if (cat.weight_groups) {
                if (cat.weight_groups.critical) cat.weight_groups.critical.forEach((w: string) => critical.add(w));
                if (cat.weight_groups.high) cat.weight_groups.high.forEach((w: string) => high.add(w));
                if (cat.weight_groups.medium) cat.weight_groups.medium.forEach((w: string) => medium.add(w));
            }

            if (cat.weight && cat.words) {
                const weight = cat.weight as IntensityTier;
                cat.words.forEach((w: string) => {
                    if (weight === 'critical') critical.add(w);
                    else if (weight === 'high') high.add(w);
                    else if (weight === 'medium') medium.add(w);
                });
            }
        }

        const addSet = (wordSet: Set<string>, tier: IntensityTier): void => {
            wordSet.forEach(originalWord => {
                const w = originalWord.toLowerCase();
                if (w.includes(' ') || w.includes('-')) {
                    const existing = this.phraseMap.get(w);
                    if (!existing || tier === 'critical' || (tier === 'high' && existing === 'medium')) {
                        this.phraseMap.set(w, tier);
                    }
                } else {
                    const stem = this.stemFunc(originalWord);
                    const existing = this.stemMap.get(stem);
                    if (!existing || tier === 'critical' || (tier === 'high' && existing === 'medium')) {
                        this.stemMap.set(stem, tier);
                        this.stemToOriginal.set(stem, w);
                    }

                    const exactExisting = this.stemMap.get(w);
                    if (!exactExisting || tier === 'critical' || (tier === 'high' && exactExisting === 'medium')) {
                        this.stemMap.set(w, tier);
                        this.stemToOriginal.set(w, w);
                    }
                }
            });
        };

        addSet(medium, 'medium');
        addSet(high, 'high');
        addSet(critical, 'critical');

        this.phraseRegex = this.buildPhraseRegex(this.phraseMap);
    }

    // Build regex for multi-word phrase matching
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

    // Returns true if a word position is preceded by a negator
    private isNegated(index: number, words: string[]): boolean {
        const start = Math.max(0, index - 3);
        for (let i = start; i < index; i++) {
            if (this.negators.has(words[i])) return true;
        }
        return false;
    }

    // Evaluates the worthiness and intensity of a text segment.
    public score(text: string): NarvoResult {
        const emptyResult: NarvoResult = {
            score: 0, lexicon: 0, structure: 0,
            hits: { critical: [], high: [], medium: [] },
            meta: { wordCount: 0, uniqueWordCount: 0, sentenceCount: 0, lexicalDiversity: 0 }
        };

        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            return emptyResult;
        }

        const lowerText = text.toLowerCase();
        const wordsRaw = lowerText.match(/\p{L}+/gu) || [];
        const wordCount = wordsRaw.length;
        const charCount = text.length;

        if (wordCount === 0) {
            return emptyResult;
        }

        const uniqueWords = new Set(wordsRaw);
        const uniqueWordCount = uniqueWords.size;
        const lexicalDiversity = uniqueWordCount / wordCount;

        const hitCritical: string[] = [];
        const hitHigh: string[] = [];
        const hitMedium: string[] = [];
        let rawLexiconScore = 0;

        const hitPhrases = new Set<string>();
        let processedText = lowerText;

        // Match multi-word phrases
        if (this.phraseRegex) {
            const phraseMatches = lowerText.matchAll(this.phraseRegex);
            for (const match of phraseMatches) {
                const phrase = match[0].toLowerCase().replace(/[\s\-]+/g, ' ');
                let tier = this.phraseMap.get(phrase);

                if (tier && !hitPhrases.has(phrase)) {
                    hitPhrases.add(phrase);

                    const indexInText = match.index || 0;
                    const textBefore = lowerText.substring(Math.max(0, indexInText - 20), indexInText);
                    const wordsBefore = textBefore.match(/\p{L}+/gu) || [];
                    const isNeg = wordsBefore.slice(-3).some(w => this.negators.has(w));

                    if (isNeg) {
                        if (tier === 'critical') tier = 'high';
                        else if (tier === 'high') tier = 'medium';
                        else tier = undefined;
                    }

                    if (tier === 'critical') { hitCritical.push(phrase); rawLexiconScore += 0.5; }
                    else if (tier === 'high') { hitHigh.push(phrase); rawLexiconScore += 0.3; }
                    else if (tier === 'medium') { hitMedium.push(phrase); rawLexiconScore += 0.1; }
                }
            }
            processedText = lowerText.replace(this.phraseRegex, (m) => ' '.repeat(m.length));
        }

        // Match individual words
        const wordHitSet = new Set<string>();

        for (let i = 0; i < wordsRaw.length; i++) {
            const rawWord = wordsRaw[i];
            const stem = this.stemFunc(rawWord);
            let tier = this.stemMap.get(stem) || this.stemMap.get(rawWord);

            if (tier && !wordHitSet.has(stem)) {
                const wordIndex = this.findWordInProcessed(processedText, rawWord, i, wordsRaw);
                if (wordIndex === -1) continue;

                wordHitSet.add(stem);

                if (this.isNegated(i, wordsRaw)) {
                    if (tier === 'critical') tier = 'high';
                    else if (tier === 'high') tier = 'medium';
                    else tier = undefined;
                }

                const displayWord = this.stemToOriginal.get(stem) || this.stemToOriginal.get(rawWord) || rawWord;

                if (tier === 'critical') { hitCritical.push(displayWord); rawLexiconScore += 0.5; }
                else if (tier === 'high') { hitHigh.push(displayWord); rawLexiconScore += 0.3; }
                else if (tier === 'medium') { hitMedium.push(displayWord); rawLexiconScore += 0.1; }
            }
        }

        // Amplifier scores
        if (this.superlativePattern) {
            const matches = text.match(this.superlativePattern) || [];
            if (matches.length > 0) {
                rawLexiconScore += Math.min(0.12, matches.length * 0.04);
            }
        }

        if (this.experientialPattern) {
            const matches = text.match(this.experientialPattern) || [];
            if (matches.length > 0) {
                rawLexiconScore += Math.min(0.15, matches.length * 0.05);
            }
        }

        const exclamationCount = (text.match(/!/g) || []).length;
        if (exclamationCount > 0) {
            rawLexiconScore += Math.min(0.10, exclamationCount * 0.03);
        }

        // Standard scaling normalization
        const lexiconScore = rawLexiconScore > 0
            ? rawLexiconScore / Math.sqrt(rawLexiconScore * rawLexiconScore + this.alpha)
            : 0;

        // Structure & Complexity metrics
        let structureScore = 0;
        structureScore += lexicalDiversity * 0.4;

        if (charCount >= 300) structureScore += 0.20;
        else if (charCount >= 150) structureScore += 0.10;
        else if (charCount >= 60) structureScore += 0.05;

        const sentenceCount = text.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
        const avgWordsPerSentence = wordCount / Math.max(sentenceCount, 1);

        if (avgWordsPerSentence > 4) structureScore += 0.10;
        if (sentenceCount > 1) structureScore += 0.10;

        const hasNumbers = /\d/.test(text);
        const hasProperNouns = /[^.!?¡¿]\s+[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ]{2,}/u.test(text);
        const hasPunctuation = /[?…]/.test(text);
        const hasQuotes = /["']/.test(text);

        if (hasNumbers) structureScore += 0.05;
        if (hasProperNouns) structureScore += 0.05;
        if (hasPunctuation) structureScore += 0.05;
        if (hasQuotes) structureScore += 0.05;

        structureScore = Math.min(1.0, structureScore);

        // Blended total score
        const lexicalWeight = 0.80;
        const structureWeight = 0.20;
        const totalScore = (lexiconScore * lexicalWeight) + (structureScore * structureWeight);

        return {
            score: Math.min(Math.max(totalScore, 0), 1),
            lexicon: Number(lexiconScore.toFixed(4)),
            structure: Number(structureScore.toFixed(4)),
            hits: {
                critical: hitCritical,
                high: hitHigh,
                medium: hitMedium
            },
            meta: {
                wordCount,
                uniqueWordCount,
                sentenceCount,
                lexicalDiversity: Number(lexicalDiversity.toFixed(4))
            }
        };
    }

    private findWordInProcessed(processedText: string, word: string, _wordIndex: number, _allWords: string[]): number {
        const regex = new RegExp(`(?<=^|[^\\p{L}])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[^\\p{L}]|$)`, 'iu');
        const match = processedText.match(regex);
        return match ? (match.index ?? 0) : -1;
    }
}
