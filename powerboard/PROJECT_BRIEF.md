## TurboToken Deep-Dive Project Brief (for Gemini Deep Research)

### 1. Product overview

TurboToken is a **free, browser-based meme coin terminal** designed for retail traders who have **low attention spans and low context**. The UI is intentionally built in a **Windows 98 aesthetic** (gray windows, bevelled borders, pixel fonts) to feel like an old-school trading terminal, but all the logic underneath is modern.

The app has two main modes:

- **ANALYZER tab**: Paste or select a Solana contract address and get a **fast, visual “ape or avoid” read** on the token:
  - Rug probability / entry timing
  - Chart lifecycle phase (launch, markup, euphoria, death, etc.)
  - Distribution / insider risk (clusters, top holders, LP status)
  - Flags and simple English guidance
- **PAPER TRADING tab**: Beginner-friendly paper trading with:
  - Email-only Supabase login (magic link, no password)
  - 10 SOL starting fake balance
  - Plays all trades as if user is always **buying** (no shorts), with:
    - Size in SOL
    - Auto-fetched entry price from live data
    - Slippage tolerance + priority fee inputs (to mimic Phantom buy flow)
    - P&L stats, open/closed trade history, and a “Current Holdings” strip

Design principle: **5–6th grade reading level** everywhere. Short sentences, no heavy jargon, and inline explanations for any technical term.

The tool repeatedly says **“Not financial advice, do your own research”** and encourages people to use paper trading to practice before risking real money.

---

### 2. Tech stack & architecture

- **Frontend / UI**
  - React + Vite SPA
  - Custom CSS with a strong Windows 98-style layer (no Tailwind in the UI layer)
  - Components like `Dashboard`, `Header`, `PaperTrading`, and Win98-esque widgets (buttons, chips, group boxes, progress meters)
- **Auth & persistence**
  - **Supabase**:
    - Email magic link auth (`auth.signInWithOtp`).
    - `paper_trades` table with RLS to store paper trades per user.
- **AI / analysis**
  - Google Gemini models:
    - Configured via `VITE_GEMINI_MODELS`, default chain: `gemini-2.0-flash`, `gemini-2.5-flash`, `gemini-2.5-pro`.
  - `evaluateTokenWithLLM()` in `apiService.js` calls Gemini with:
    - A strict **system prompt** describing how to score volume, narrative, distribution, liquidity, and rug risk.
    - A required **JSON schema** for the response.
  - Deterministic pre-processing and post-processing around the LLM so we never blindly trust AI.
- **Runtime**
  - Everything runs client-side in the browser (no custom backend server yet).
  - API calls go directly from browser → external services (DexScreener, RugCheck, Bubblemaps, Supabase, Gemini).

---

### 3. Data pipeline (Analyzer)

When a user picks a token and clicks **ANALYZE TOKEN**, the system roughly does this:

1. **Token X-Ray fetch (`fetchTokenXRay`)**
   - **DexScreener**:
     - For a given contract address, call:
       - `https://api.dexscreener.com/latest/dex/tokens/{ca}` to get live DEX pairs.
     - Extract:
       - Price in USD
       - 24h volume
       - Liquidity and market cap
       - Basic chart history (OHLC / change percentages)
   - **RugCheck**:
     - `https://api.rugcheck.xyz/v1/tokens/{ca}`
     - Used to pull:
       - Distribution/top holder metrics (top 10 holder %)
       - LP lock/burn status
       - Known risk flags and warnings
   - **Bubblemaps**:
     - `https://api-legacy.bubblemaps.io/map-data`
     - Used to infer:
       - Cluster concentration (largest cluster, top 3 clusters)
       - Insider supply %
       - Cluster-to-liquidity ratios
   - **Pre-bond detection**:
     - If DexScreener returns **no pairs**, but other signals suggest the token exists (e.g., on a bonding curve like pump.fun), we set `isPreBond: true` and drive special pre-bond logic instead of failing hard.

2. **Normalization layer (deterministic data normalizers)**
   - `normalizeRugcheckSignals()`:
     - Extracts values like:
       - `top_10_holder_percentage` (always normalized to an actual 0–100 percentage)
       - `lp_status` (BURNED / LOCKED / UNLOCKED / UNKNOWN)
       - A list of warnings / flags
   - `normalizeBubblemapsSignals()`:
     - Handles multiple payload shapes and optional fields.
     - Outputs:
       - `largest_cluster_percentage`
       - `top_3_clusters_percentage`
       - `insider_supply_percentage`
       - `cluster_to_liquidity_ratio`
     - Uses helper functions like `toFiniteNumber` and `toPercentNumber` to avoid converting `null` into fake `0.0` values.
   - Chart data from DexScreener is reduced to a compact structure for the chart lifecycle engine.

3. **Chart lifecycle engine**
   - `computeChartLifecycle()`:
     - Uses deterministic rules on live data to classify:
       - Phase: `LAUNCH`, `DISCOVERY`, `MARKUP`, `EUPHORIA`, `DISTRIBUTION`, `DEATH`, `REVIVAL`, `UNKNOWN`, plus `PRE_BOND` for bonding-curve stage.
       - Trend structure: `BULLISH`, `NEUTRAL`, `BEARISH`
       - Volume confirmation: `CONFIRMED`, `WEAK`, `DIVERGENCE`, `UNKNOWN`
       - Setup quality score (1–10)
       - Ape signal: `APE_NOW`, `WAIT_PULLBACK`, `AVOID`
       - Invalidation level: a single-line condition in plain English.
     - For **pre-bond tokens**, the phase becomes `PRE_BOND`, and the logic focuses more on rug risk and distribution than on chart patterns.

4. **LLM analysis (`evaluateTokenWithLLM`)**
   - After deterministic signals are prepared, they are passed into Gemini with a **very strict system prompt**:
     - Priority: distribution & rug risk → liquidity & exitability → volume quality → narrative → dev wallet behavior.
     - Response must be a rigid JSON object with:
       - Overall risk score (1–10)
       - Recommendation (`BUY`, `CAUTION`, `AVOID`) — which we reinterpret in the UI as **“Action Status”** rather than advice.
       - `three_pillars` (volume/narrative/distribution) with scores, status text, and red/green flags.
       - `liquidity_analysis` details and flags.
       - `chart_lifecycle` summary.
       - Short 2–3 sentence summary (5–6th grade).
   - The prompt explicitly forbids hallucinating dev-selling evidence without actual transaction signatures and encourages using `UNKNOWN` where data is missing.

5. **Deterministic enforcement (`enforceDeterministicRiskRules`)**
   - After Gemini’s response, we **override** or clamp parts of the AI output when hard metrics contradict it.
   - Example rules:
     - If `top_10_holder_percentage > 30%`, force a severe centralization flag, add red flags, and clamp any overly-optimistic distribution text.
     - If insider clusters > certain thresholds (e.g., `largest_cluster_percentage` extremely high, or `insider_supply_percentage` large), we add hard red flags and can flip the ape signal toward caution/avoid.
     - If `liquidity_to_mcap_ratio < 5%`, flag as exit-risk and lower the setup quality.
   - This makes the tool more like **“AI plus deterministic guardrails”** rather than a pure black-box model.

6. **Fallback engine**
   - If Gemini is unavailable, too slow, or errors:
     - `fallbackAnalysisFromXray()` builds a **deterministic-only analysis object**:
       - Uses normalized RugCheck + Bubblemaps + DexScreener signals.
       - Computes chart lifecycle.
       - Fills in pillar scores, summary text, and flags using simple, rule-based templates.
   - The UI shows this fallback **immediately** after X-Ray completes, then upgrades the screen when/if the LLM result arrives.

---

### 4. UI behavior & UX framing

#### Analyzer tab

- **Header / Action Zone**
  - Shows the current token name + contract address in a Win98 “sunken” field with **1-click copy** for the contract.
  - Displays a large **Entry Timing / Rug Probability-style score**, reframed to talk about **“how early or late you are”** in the meme lifecycle instead of just abstract “risk”.
  - Primary actions (for context, not executed in-app):
    - “AVOID” style messaging
    - Photon affiliate button on the right rail.

- **3-Second Summary widget**
  - Replaces long paragraphs with three horizontal meters:
    - Volume
    - Narrative
    - Distribution
  - Each is a 0–100% bar, colored and captioned simply.

- **Flags**
  - Red and green flags are shown as **short bullet lists**, moved up directly under the summary so users can scan them instantly.

- **Deep audit (progressive disclosure)**
  - Detailed reasoning and nerd metrics (data sources, confidence scores, lists of on-chain red flags, etc.) live behind:
    - HTML `<details>` with `<summary className="button">View Deep Audit</summary>`.
    - Expanded content is inside a `.sunken-panel` for that Win98 sunken look.
  - This keeps the main surface low on cognitive load while still serving power users.

- **Strategy / Chart Lifecycle**
  - A dedicated STRATEGY section shows:
    - Phase (plain-language, e.g., “early pump”, “late blow-off top”)
    - Ape signal (ape now / wait for pullback / avoid)
    - Setup quality score
    - Volume confirmation
    - Invalidation
  - For **pre-bond** coins, the strategy text calls this out and explains that:
    - There’s no DEX liquidity yet.
    - Getting in early can be high reward but also high rug risk.

- **Conflict note**
  - If we detect a conflict like “chart going up but rug risk high”, we show a **thin orange note**:
    - Example: “Chart is going up (Markup phase), but rug risk is high.”
  - Placed inline near the strategy header, not as a huge banner.

- **AI summary positioning**
  - The LLM’s natural-language summary is shown as:
    - Label: **“TurboToken opinion:”** (no robot emoji).
    - Placement: **between** the Entry Timing block and the top metrics grid.
  - This makes it feel like a quick human-readable caption, not a replacement for the deterministic data.

#### Paper Trading tab

- **Audience:** Complete beginners.
  - Inputs are labeled in plain English:
    - “How much SOL?”
    - “Price I bought at” (auto-filled)
    - “Profit / Loss”
    - “My Balance”
  - Every field has a 1-line helper text below it.
  - Login copy: “No password needed — we’ll email you a one-click sign-in link.”
  - Empty history state: “No trades yet. Use the form above to track your first one!”

- **Trade model**
  - Only **BUY** trades (no shorting).
  - Live entry price is auto-fetched from DexScreener when the user pastes a token address.
  - Entry price input is **read-only**; it reflects the fetched price (simulating Phantom’s “price you get”).
  - Slippage tolerance and priority fee:
    - Preset buttons (0.5%, 1%, 2% etc.) for slippage.
    - Preset fees (“Slow”, “Normal”, “Fast”) for the validator tip.
    - Custom fields to override if needed.
  - P&L calculation applies:
    - Effective entry price adjusted for slippage.
    - Subtracts priority fee in SOL.

- **Live price + SELL**
  - Each open holding has:
    - Token symbol (rendered as `$SYMBOL`).
    - Shortened address.
    - Size in SOL.
    - Current P&L.
    - **PHOTON** button → opens Photon for that token’s CA.
    - **SELL** button:
      - Fetches live price from DexScreener.
      - Shows a confirm dialog with current price and P&L.
      - On confirm, writes `close_price` and `closed_at` to Supabase, and the row is greyed out.

- **Performance vs History**
  - Tabs at the top of the table region:
    - **PERFORMANCE**:
      - Starting balance
      - Current balance
      - Total Profit / Loss
      - Open / Closed trades
      - Win rate
      - Best trade, worst trade, average trade P&L
      - Rendered as compact Win98 stat strips for easy screenshots.
    - **HISTORY**:
      - Full trade table with all fields and actions.
  - Between tabs and table, there is a **Current Holdings** section summarizing **open** trades only.

- **Rebalance with TurboToken (new UI element)**
  - In the PAPER TRADING header (`PAPER TRADING` title bar), there is a blue Win98 button:
    - Label: `⚡ Rebalance with TurboToken`
  - Clicking it opens an inline Win98 card that explains:
    - “Buy any amount of $TURBO to help keep TurboToken free.”
    - “For every $1 USD of $TURBO you buy, you receive +20 paper SOL added to your practice balance.” (This is a **conceptual framing**, not an actual automated credit system yet.)
    - A clear disclaimer: “Not financial advice. Do your own research before buying any token. Paper SOL is for practice only.”
    - A button: `⚡ Buy $TURBO on Photon`, which opens a Photon affiliate link using `VITE_TURBO_TOKEN_CA` and `VITE_PHOTON_BOT_TEMPLATE`.

---

### 5. Performance and latency issues (current state)

Right now, the app **works**, but there are noticeable **lag spikes**:

- **Analyzer latency**
  - The chain is:
    1. DexScreener → RugCheck → Bubblemaps → Gemini LLM
    2. Each external HTTP call has a timeout (`API_TIMEOUT` ~15s, `LLM_TIMEOUT` ~30s).
  - Even though we now show deterministic fallback as soon as X-Ray completes, the **first paint** can still feel slow if:
    - DexScreener is slow to respond.
    - RugCheck or Bubblemaps lag.
  - There is no backend cache; every user hits the public APIs directly.

- **Paper Trading live-price latency**
  - Live quotes are fetched per token address via DexScreener with a **4s timeout** (using `AbortController`).
  - We cache quotes for about 30 seconds in memory, but:
    - Browser restarts / refreshes clear the cache.
    - A slow DexScreener response still makes the “Checking live price…” message sit for a few seconds.

This leads to user feedback like:

- “The token analysis still takes forever.”
- “Fetching live price took a long time.”

We want to **shorten perceived latency** to **<2 seconds** where possible.

---

### 6. Trust, safety, and disclaimers

TurboToken is intentionally framed as a **“tool, not a signal service”**:

- We repeatedly state:
  - “Not financial advice. Do your own research.”
  - “Use paper trading to get used to trading.”
- We avoid:
  - Making direct “buy now” calls.
  - Phrasing that sounds like guaranteed outcomes.
- We encourage:
  - Looking directly at the on-chain data and metrics.
  - Cross-checking any decision with other tools.

We want Gemini to **enhance** this, not undermine it.

---

### 7. Affiliate & monetization model

- **Photon affiliate**
  - We use `VITE_PHOTON_BOT_TEMPLATE` with `{ca}` placeholder to build URLs like:
    - `https://photon-sol.tinyastro.io/...{ca}` (exact template configured via env).
  - There are two major Photon entry points:
    - Right rail: “BUY WITH PHOTON”.
    - Left rail + Paper Trading “rebalance” flow: “⚡ BUY $TURBO on Photon”.
  - On click:
    - Copy the contract address to clipboard (where allowed).
    - Open the Photon URL in a new tab.
    - Show a short status message like:
      - “Copied CA to clipboard and opened Photon site” or
      - “Opened Photon site (clipboard unavailable)”.

- **TurboToken support narrative**
  - The left rail explains:
    - TurboToken is free, including paper trading.
    - Best way to support is by **owning the $TURBO token**.
    - Buying via Photon helps cover server costs via affiliate revenue, keeping TurboToken free for everyone.

---

### 8. What we want Gemini Deep Research to help with

We want Gemini Deep Research to act as a **technical advisor** on the data and architecture side, not as a replacement for our own deterministic logic.

Specific questions and tasks for Gemini:

1. **Data sources & reliability**
   - Evaluate our current stack:
     - DexScreener (price/volume/liquidity)
     - RugCheck (distribution + risk flags)
     - Bubblemaps (clusters/insiders)
     - Supabase (storage, auth)
   - Suggest **open-source or commercial** alternatives that:
     - Offer **faster**, more reliable Solana token data (price, volume, liquidity, holders, on-chain alerts).
     - Provide good documentation and generous free tiers, if possible.
   - Candidate ideas to explore:
     - Helius (webhooks, enriched transactions, holder index)
     - Birdeye APIs and WebSockets
     - Jupiter price API or aggregator APIs
     - QuickNode Solana data and streaming RPC
     - Any open-source projects that already implement on-chain meme coin risk scoring.

2. **Performance improvements**
   - Propose ways to:
     - Parallelize or pipeline API calls instead of serializing everything.
     - Introduce **caching** (localStorage, edge caching, or a thin backend) to avoid re-pulling the same CA over and over.
     - Use background refresh or streaming to make the UI feel responsive in **<2 seconds**, even if full data takes longer to compute.
   - Suggest concrete patterns for:
     - Handling timeouts and partial data gracefully.
     - Showing “deterministic now, AI later” in a more sophisticated way (e.g., progressive enhancement of flags, not a full redraw).

3. **Risk logic & deterministic rules**
   - Review our:
     - `normalizeRugcheckSignals()`
     - `normalizeBubblemapsSignals()`
     - `enforceDeterministicRiskRules()`
     - `computeChartLifecycle()`
   - Recommend:
     - Additional hard thresholds or metrics we could compute **without** AI (e.g., wallet age, top wallet behavior, LP unlock schedule).
     - Ways to combine open-source rug detection logic (e.g., honeypot detection) with our existing pipeline.

4. **User safety & disclaimers**
   - Suggest:
     - Where and how to place more **clear but minimal** disclaimers (“Not financial advice, do your own research”).
     - Simple, non-patronizing language to remind users:
       - Meme coins are high risk.
       - They should cross-check data and not rely solely on any one tool.

5. **Beginner UX**
   - Validate:
     - That our labels and helper texts are understandable at a ~6th grade reading level.
   - Suggest improvements to:
     - Paper trading copy.
     - Entry timing / phase language (e.g., “very early”, “mid run”, “late and risky”).
     - How we talk about slippage and priority fees in the Phantom-style UI.

---

### 9. Summary for Gemini (TL;DR)

- TurboToken is a **free, Win98-style Solana meme coin terminal** with:
  - A deterministic + AI hybrid analyzer.
  - A very beginner-friendly paper trading simulator.
- It uses **DexScreener + RugCheck + Bubblemaps + Gemini** with strict JSON schemas and strong deterministic guardrails.
- The **main pain points** today:
  - Slow analysis and live price fetches (user-perceived lag).
  - No backend caching or streaming.
  - We want more robust, open-source friendly data sources and risk logic.
- We care a lot about:
  - **Trustworthy, deterministic data**.
  - Clear **“not financial advice, do your own research”** messaging.
  - Keeping everything simple enough for someone who is **new to meme coins and trading**.

We want you, Gemini, to:

- Audit this architecture at a high level.
- Propose **specific data providers, OSS projects, and architectural patterns** to make TurboToken:
  - Faster.
  - More robust.
  - Safer for retail traders to rely on as **one input** (not the only input) in their decision-making.

