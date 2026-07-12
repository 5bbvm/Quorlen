<h1 align="center">Narvo</h1>

<p align="center">
  <strong>A standalone, zero-dependency text worthiness scorer and lexicon analysis engine.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-%3E%3D%2018-blue.svg" alt="Node.js Version" />
  <img src="https://img.shields.io/badge/TypeScript-5.4-blue.svg" alt="TypeScript Version" />
  <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License MIT" />
</p>

## 🚀 Overview

Narvo is a lightweight, pure TypeScript scoring module designed to evaluate the "worthiness" or intensity of text. It uses a deterministic morphological stemming approach and lexicon dictionaries to parse, analyze, and grade text with zero external dependencies.

## 📦 Project Structure

```text
Narvo/
└── javascript/
    ├── src/
    │   ├── index.ts           # Core scoring engine
    │   └── dictionary.json    # Lexicon configuration and weights
    ├── package.json           # Node.js dependencies and scripts
    ├── tsconfig.json          # TypeScript compilation settings
    └── example.ts             # Verification and testing script
```

## 🛠️ Installation & Setup

1. **Navigate to the JavaScript ecosystem folder:**
   ```bash
   cd javascript
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Build the production bundle:**
   ```bash
   npm run build
   ```
   *Outputs clean JavaScript, `.d.ts` declaration files, and maps to the `./dist` folder.*

## 💻 Usage

Run the verification script directly from the root `Narvo/` directory via `ts-node`:

```bash
npx ts-node javascript/example.ts
```

### Quick Example

```typescript
import { TextWorthinessScorer } from './src/index';
import lexiconData from './src/dictionary.json';

const scorer = new TextWorthinessScorer(lexiconData);
const score = scorer.score("This product is completely ecstatic, a legendary triumph.");

console.log(score);
```

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.

<hr/>
<p align="center">Built with ❤️ by Muthana Maiah</p>
