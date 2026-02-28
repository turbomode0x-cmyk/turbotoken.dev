# TurboToken

A free, browser-based meme coin terminal designed for retail traders. TurboToken provides fast, visual "ape or avoid" analysis for Solana tokens using a hybrid approach: deterministic risk scoring with AI-powered insights.

## Features

- **ANALYZER Tab**: Paste a Solana contract address and get instant analysis:
  - Rug probability and entry timing
  - Chart lifecycle phase detection
  - Distribution and insider risk analysis
  - Liquidity and exitability checks
  - AI-powered insights with deterministic guardrails

- **PAPER TRADING Tab**: Beginner-friendly paper trading simulator:
  - Email-only authentication (magic link, no password)
  - 10 SOL starting balance
  - Track trades with live price updates
  - Performance metrics and trade history

## Architecture

TurboToken uses a **deterministic + AI hybrid** architecture:

1. **Deterministic Data Pipeline**: Fetches and normalizes data from:
   - DexScreener (price, volume, liquidity)
   - RugCheck (distribution, LP status, risk flags)
   - Bubblemaps (cluster analysis, insider supply)

2. **Deterministic Risk Scoring**: Hard rules enforce safety thresholds:
   - Top 10 holder concentration > 30% → CRITICAL
   - Liquidity/MC ratio < 5% → DANGEROUS
   - LP unlocked → AVOID
   - Largest cluster > 20% → CRITICAL

3. **AI Enhancement**: Gemini models provide narrative analysis, but AI output is always validated and overridden by deterministic rules when they conflict.

4. **Fallback System**: If AI is unavailable, the app shows deterministic-only analysis immediately.

## Setup

### Prerequisites

- Node.js 18+ or Bun
- A Supabase project (for paper trading)
- A Gemini API key (for AI analysis)

### Installation

1. Clone the repository:
```bash
git clone <repo-url>
cd turbotoken.dev/powerboard
```

2. Install dependencies (repo root, then app folder):
```bash
cd powerboard
bun install        # or: npm install
```

3. Create `.env.local` file (see `.env.example` for template):
```bash
cp .env.example .env.local
```

4. Configure environment variables:
- `VITE_SUPABASE_URL`: Your Supabase project URL
- `VITE_SUPABASE_ANON_KEY`: Your Supabase anon key
- `GEMINI_API_KEY`: Your Google Gemini API key (server-side only)
- `VITE_PHOTON_BOT_TEMPLATE`: Photon affiliate link template (optional)
- `VITE_TIP_WALLET`: Solana wallet for tips (optional)

### Running Locally

```bash
bun run dev
# or
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Building for Production

```bash
bun run build
# or
npm run build
```

The built files will be in the `dist/` directory.

## Project Structure

```
powerboard/
├── src/
│   ├── components/          # React components
│   │   ├── Dashboard.jsx    # Main analyzer UI
│   │   ├── PaperTrading.jsx # Paper trading simulator
│   │   └── ...
│   ├── services/            # Business logic
│   │   ├── api/             # API clients and normalizers
│   │   ├── ai/              # AI evaluation and validation
│   │   ├── risk/            # Risk scoring and enforcement
│   │   └── apiService.js    # Public API (re-exports)
│   ├── hooks/               # React hooks
│   └── lib/                 # Utilities
├── .env.example             # Environment variables template
└── package.json
```

## Security Considerations

### Gemini API Key (Server-Side Only)

The Gemini API key is **never sent to the browser**. All AI calls go through the `/api/gemini-eval` serverless function on Vercel, which reads `GEMINI_API_KEY` from server-only environment variables.

Recommended practices:

1. **Keep `GEMINI_API_KEY` server-only**: Do not expose it via any `VITE_*` variables.
2. **Key Rotation**: Implement regular key rotation procedures in Google Cloud Console and Vercel.
3. **Model Configuration**: Optionally set `GEMINI_MODELS` (server env) to control which models are used.

### Rate Limiting

Currently, on-chain data APIs (DexScreener, RugCheck, Bubblemaps) are called directly from the browser. Consider:

- Adding a client-side rate limiting wrapper
- Moving these calls behind a backend proxy for heavy production traffic
- Monitoring API usage to detect abuse

### CORS Dependency

The app relies on CORS being enabled for external APIs (DexScreener, RugCheck, Bubblemaps). If any provider blocks cross-origin requests, the app will break. Consider adding a proxy layer for production.

## Environment Variables

See `.env.example` for the complete list.

**Client-exposed variables (Vite):**

- `VITE_SUPABASE_URL`: Supabase project URL
- `VITE_SUPABASE_ANON_KEY`: Supabase anonymous key
- `VITE_PHOTON_BOT_TEMPLATE`: Photon affiliate link template
- `VITE_TIP_WALLET`: Solana wallet address for tips
- `VITE_SNIPE_BOT_TEMPLATE`: Snipe bot link template

**Server-only variables (Vercel):**

- `GEMINI_API_KEY`: Google Gemini API key (server-side only)
- `GEMINI_MODELS`: Comma-separated list of Gemini models (optional)

## Supabase Setup

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Create the `paper_trades` table (see `supabase-schema.sql`)
3. Enable Row Level Security (RLS) policies
4. Copy your project URL and anon key to `.env.local`

## Development

### Code Style

- Uses ESLint for code quality
- Windows 98 aesthetic CSS (no Tailwind)
- React functional components with hooks

### Testing

No test infrastructure currently exists. Recommended additions:

- Vitest for unit tests
- Test normalization functions
- Test risk scoring logic
- Test chart lifecycle computation

## License

[Add your license here]

## Disclaimer

**Not financial advice.** TurboToken is a tool for analysis and education. Always do your own research before making any trading decisions. Meme coins are highly speculative and can lose all value.
