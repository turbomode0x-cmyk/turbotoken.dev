# TurboToken Code Audit

**Repo:** `turbomode0x-cmyk/turbotoken.dev`  
**Reviewed:** 2026-02-27  
**Commit:** `c0430d0` (main)  
**Location:** `/Users/clawp/Dev/turbotoken.dev`

---

## Executive Summary

The codebase is conceptually solid — the analyzer architecture with deterministic guardrails around AI is well-designed. However, the project has **build-breaking bugs**, **code quality issues**, and **dependency hygiene problems** that need attention before it can be considered production-ready.

---

## Critical Issues (Build-Breaking)

### 1. Missing Export: `computeDeterministicRiskScore`

**Location:** `src/services/apiService.js`

**Problem:** The function is defined internally but never exported. `src/hooks/useTokenData.js` imports it (line 8), causing the build to fail.

```javascript
// apiService.js line ~890 — NOT EXPORTED
function computeDeterministicRiskScore({...}) { ... }

// useTokenData.js line 8 — IMPORTS IT
import { ... computeDeterministicRiskScore } from '../services/apiService.js'
```

**Fix:** Add `export` to the function definition.

---

### 2. Undefined Variable: `hasCriticalLiquidity`

**Location:** `src/hooks/useTokenData.js`, line 251

**Problem:** Referenced but never declared.

```javascript
// Line 251
status: hasCriticalLiquidity ? 'DANGEROUS' : highRisk ? 'RISKY' : 'UNKNOWN',
```

**Fix:** Define it before use, or remove the reference.

---

### 3. Missing Import: `buildPhotonUrl`

**Location:** `src/components/PaperTrading.jsx`, line 624

**Problem:** Used but not imported.

```javascript
// Line 624
const photonUrl = t.token_address ? buildPhotonUrl(t.token_address) : null
```

**Fix:** Import from `../lib/supabaseClient.js` or create a local import.

---

## Lint Errors

| File | Line | Issue |
|------|------|-------|
| `src/App.jsx` | 50, 103 | Unused `err` variable |
| `src/App.jsx` | 57 | setState inside useEffect (anti-pattern) |
| `src/components/PaperTrading.jsx` | 624 | `buildPhotonUrl` not defined |
| `src/hooks/useTokenData.js` | 251 | `hasCriticalLiquidity` not defined |

---

## Code Quality Issues

### 4. Monolithic Service File

**Location:** `src/services/apiService.js` (~1260 lines)

**Problem:** One file handles:
- API URLs and constants
- Data fetching (DexScreener, RugCheck, Bubblemaps)
- Normalization logic
- System prompt management
- LLM evaluation
- Deterministic risk scoring
- Response validation and coercion

**Impact:** Hard to maintain, test, or modify one area without breaking another.

**Fix:** Split into focused modules:
```
src/
  services/
    api/
      constants.js
      fetcher.js        # Raw API calls
      normalizers.js    # RugCheck, Bubblemaps normalization
    ai/
      prompts.js        # System prompts
      evaluator.js      # LLM logic
    risk/
      scoring.js       # computeDeterministicRiskScore
      enforcement.js   # enforceDeterministicRiskRules
      lifecycle.js     # computeChartLifecycle
    validation.js      # Response schema validation
```

---

### 5. Dead Code / Unused Files

| File | Status |
|------|--------|
| `src/lib/analyzer.js` (~500 lines) | Defined but never imported anywhere |
| `src/components/SupportPage.jsx` | Exported but never used in App.jsx |

**Fix:** Remove these files, or wire up SupportPage if it's intended functionality.

---

### 6. Unused Dependencies

**Location:** `package.json`

The following are installed but never imported in app code:
- `@solana/wallet-adapter-base`
- `@solana/wallet-adapter-react`
- `@solana/wallet-adapter-react-ui`
- `@solana/wallet-adapter-wallets`
- `@solana/web3.js`

**Fix:** Remove unused packages to reduce bundle size and attack surface.

---

### 7. Inconsistent Environment Configuration

**Location:** `.env.example`

Issues:
- Duplicate keys: `VITE_TIP_WALLET` appears twice (lines 10 and 18)
- `VITE_SNIPE_BOT_TEMPLATE` appears twice (lines 15 and 19)
- Missing: `VITE_GEMINI_MODELS` (used in `apiService.js` line 6)
- Missing: `VITE_PHOTON_BOT_TEMPLATE` (used in `WalletProvider.jsx` line 18)

**Fix:** Deduplicate and add all required variables.

---

### 8. Placeholder README

**Location:** `README.md` (root) and `powerboard/README.md`

Both are the default Vite template — no project-specific documentation exists.

**Fix:** Replace with actual docs covering:
- Setup instructions
- Environment variables
- Architecture overview
- Running locally

---

## Security & Runtime Concerns

### 9. Client-Side API Keys

**Location:** Throughout — `VITE_GEMINI_API_KEY` is used directly in browser code

**Problem:** Anyone who inspects the JS bundle can extract the key.

**Mitigations:**
- Restrict key by HTTP referrer in Google Cloud Console
- Use a thin backend proxy (Cloudflare Worker, Vercel API route) to hold the key
- Implement key rotation

---

### 10. No Rate Limiting on Client

All API calls (DexScreener, RugCheck, Bubblemaps, Gemini) go directly from browser. Users or scripts can hammer these endpoints.

**Fix:** Consider adding:
- Client-side rate limiting wrapper
- Or move to a thin backend that can throttle

---

### 11. CORS Dependency

The app relies on CORS being open for all external APIs. If any provider blocks cross-origin requests, the app breaks.

**Fix:** Monitor or add a proxy layer.

---

## Dependency Vulnerabilities

### 12. `bun audit` Results

```
6 vulnerabilities (4 high, 1 moderate, 1 low)

High:
- minimatch: ReDoS via repeated wildcards
- minimatch: ReDoS in matchOne()  
- minimatch: Nested *() extglobs catastrophic backtracking
- rollup: Arbitrary File Write via Path Traversal

Moderate:
- lodash: Prototype Pollution in _.unset/_.omit

Low:
- elliptic: Risky cryptographic primitive
```

**Fix:** Run `bun update` to patch, then re-audit. These are mostly transitive deps from wallet-adapter packages.

---

## UI/UX Issues

### 13. Windows 98 CSS is Inline

**Location:** `src/index.css`, `src/components/*.css`

All styles are in separate CSS files with a Windows 98 theme. This is fine but worth noting — no Tailwind or modern CSS-in-JS is used.

---

### 14. No Error Boundaries

React error boundaries are not implemented. A crash in any component takes down the whole app.

**Fix:** Add ErrorBoundary wrapper.

---

## Recommended Fix Priority

| Priority | Issue | Effort |
|----------|-------|--------|
| P0 | Fix build errors (#1-3) | Low |
| P1 | Fix lint errors (#1-3 + App.jsx) | Low |
| P1 | Clean up .env.example (#7) | Low |
| P2 | Remove dead code (#5) | Low |
| P3 | Split apiService.js (#4) | Medium |
| P3 | Remove unused deps (#6) | Low |
| P3 | Write real README (#8) | Medium |
| P4 | Add error boundaries | Medium |
| P4 | Address security concerns (#9-11) | High |

---

## Testing Status

- No test files exist in the project.
- Recommend adding Vitest tests for:
  - Normalization functions (`normalizeRugcheckSignals`, `normalizeBubblemapsSignals`)
  - Risk scoring (`computeDeterministicRiskScore`)
  - Lifecycle computation (`computeChartLifecycle`)

---

## Notes

- Project uses Bun (`bun.lock` present, all scripts work with `bun run`).
- Supabase integration is properly secured with RLS policies.
- The "deterministic guardrails around AI" architecture is well-thought-out and should be preserved when refactoring.
