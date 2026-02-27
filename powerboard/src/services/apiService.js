const DEXSCREENER_SEARCH_URL = 'https://api.dexscreener.com/latest/dex/search'
const DEXSCREENER_TOKEN_URL = 'https://api.dexscreener.com/latest/dex/tokens'
const RUGCHECK_URL = 'https://api.rugcheck.xyz/v1/tokens'
const BUBBLEMAPS_URL = 'https://api-legacy.bubblemaps.io/map-data'
const GEMINI_MODELS = (
  import.meta.env.VITE_GEMINI_MODELS ||
  'gemini-2.0-flash,gemini-2.5-flash,gemini-2.5-pro'
)
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean)

// Timeout constants (milliseconds)
const API_TIMEOUT = 15000 // 15 seconds for external APIs
const LLM_TIMEOUT = 30000 // 30 seconds for LLM evaluation

const ANALYZER_SYSTEM_PROMPT = `
You are a memecoin evaluation assistant trained on professional trading frameworks.
Analyze the token using this exact priority order:
1) DISTRIBUTION & RUG RISK
2) LIQUIDITY & EXITABILITY
3) VOLUME ANALYSIS (Real vs Fake)
4) NARRATIVE STRENGTH
5) DEV WALLET & CONTRACT SECURITY

Core requirements:
- Detect bundle patterns (e.g. 2.58%, 2.38%, 2.11%, 2.10%) and fresh-wallet clusters as rug risk.
- Calculate top_10_holder_percentage from distribution data. If >30%, flag as severe centralization risk.
- Compare liquidity vs market cap for exitability. Calculate liquidity_to_mcap_ratio. If <0.05 (5%), flag as high-risk.
- Determine lp_status: BURNED (safest), LOCKED (time-locked), UNLOCKED (dangerous), or UNKNOWN if data unavailable.
- Detect suspicious volume patterns (same-timestamp sells, repeated wallet loops, bot-like cadence).
- Use current live chart data (price changes + buy/sell flow) to classify meme lifecycle stage.
- Include narrative strength and market alignment.
- Include contract renounce status + dev wallet behavior.
- CRITICAL: Never claim dev_selling_while_promoting=true unless dev_sell_evidence array contains explicit transaction signatures or cryptographic proof.
- If evidence is missing or uncertain, use null/UNKNOWN. Do not guess.
- Assume adversarial market conditions and prioritize trader survival.

Writing style rules (CRITICAL):
- Write at a 5th-6th grade reading level.
- Use short, clear sentences.
- Use plain words and avoid jargon.
- If you use a technical term, explain it in simple words right after.
- Be practical: explain what it means and what to do next.
- No hype language.
- Keep summary to 2-3 short sentences.

Return ONLY valid JSON with this structure:
{
  "token_symbol": "TOKEN",
  "token_address": "address",
  "overall_risk_score": 1-10,
  "recommendation": "BUY|CAUTION|AVOID",
  "summary": "2-3 sentence summary",
  "three_pillars": {
    "volume": { "score": 1-10, "status": "string", "details": "string", "red_flags": [], "green_flags": [] },
    "narrative": { "score": 1-10, "status": "string", "details": "string", "red_flags": [], "green_flags": [] },
    "distribution": { "score": 1-10, "status": "string", "details": "string", "red_flags": [], "green_flags": [], "top_10_holder_percentage": 0.0 }
  },
  "liquidity_analysis": {
    "market_cap": 0,
    "liquidity": 0,
    "liquidity_ratio": 0,
    "liquidity_to_mcap_ratio": 0.0,
    "lp_status": "BURNED|LOCKED|UNLOCKED|UNKNOWN",
    "status": "string",
    "details": "string",
    "red_flags": [],
    "green_flags": []
  },
  "chart_lifecycle": {
    "phase": "LAUNCH|DISCOVERY|MARKUP|EUPHORIA|DISTRIBUTION|DEATH|REVIVAL|UNKNOWN",
    "phase_confidence": "LOW|MEDIUM|HIGH",
    "trend_structure": "BULLISH|NEUTRAL|BEARISH",
    "momentum_status": "ACCELERATING|COOLING|EXHAUSTED|UNKNOWN",
    "volume_confirmation": "CONFIRMED|WEAK|DIVERGENCE|UNKNOWN",
    "setup_quality_score": 1-10,
    "ape_signal": "APE_NOW|WAIT_PULLBACK|AVOID",
    "invalidation": "one short line",
    "details": "2-3 short sentences in plain English"
  },
  "security_checks": {
    "contract_renounced": false,
    "dev_wallet_history": "string",
    "dev_selling_while_promoting": true|false|null,
    "dev_sell_evidence": ["tx_signature_or_proof"],
    "status": "string",
    "details": "string",
    "red_flags": [],
    "green_flags": []
  },
  "actionable_guidance": {
    "if_buying": {
      "position_size": "string",
      "entry_strategy": "string",
      "profit_targets": "string",
      "stop_loss": "string"
    },
    "if_avoiding": {
      "reason": "string",
      "alternative": "string"
    }
  },
  "all_red_flags": [],
  "all_green_flags": []
}
`.trim()

function normalizeDexPair(pair) {
  return {
    symbol: pair.baseToken?.symbol || 'UNKNOWN',
    name: pair.baseToken?.name || 'Unknown Token',
    address: pair.baseToken?.address || '',
    chainId: pair.chainId || '',
    dexId: pair.dexId || '',
    pairAddress: pair.pairAddress || '',
    priceUsd: Number(pair.priceUsd || 0),
    marketCap: Number(pair.marketCap || 0),
    liquidityUsd: Number(pair.liquidity?.usd || 0),
    volume24h: Number(pair.volume?.h24 || 0),
    volume: {
      m5: Number(pair.volume?.m5 || 0),
      h1: Number(pair.volume?.h1 || 0),
      h6: Number(pair.volume?.h6 || 0),
      h24: Number(pair.volume?.h24 || 0),
    },
    priceChange: {
      m5: Number(pair.priceChange?.m5 || 0),
      h1: Number(pair.priceChange?.h1 || 0),
      h6: Number(pair.priceChange?.h6 || 0),
      h24: Number(pair.priceChange?.h24 || 0),
    },
    txns: {
      m5: {
        buys: Number(pair.txns?.m5?.buys || 0),
        sells: Number(pair.txns?.m5?.sells || 0),
      },
      h1: {
        buys: Number(pair.txns?.h1?.buys || 0),
        sells: Number(pair.txns?.h1?.sells || 0),
      },
      h6: {
        buys: Number(pair.txns?.h6?.buys || 0),
        sells: Number(pair.txns?.h6?.sells || 0),
      },
      h24: {
        buys: Number(pair.txns?.h24?.buys || 0),
        sells: Number(pair.txns?.h24?.sells || 0),
      },
    },
    txns24h: {
      buys: Number(pair.txns?.h24?.buys || 0),
      sells: Number(pair.txns?.h24?.sells || 0),
    },
  }
}

async function fetchWithTimeout(url, init = {}, timeoutMs = API_TIMEOUT) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    clearTimeout(timeoutId)
    if (!response.ok) {
      const statusText = response.statusText || 'Unknown error'
      throw new Error(`API request failed: ${statusText} (${response.status})`)
    }
    return response.json()
  } catch (err) {
    clearTimeout(timeoutId)
    if (err.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs / 1000}s. The service may be slow or unavailable.`)
    }
    // Handle network/CORS errors
    if (err.message === 'Failed to fetch' || err.message.includes('fetch')) {
      throw new Error(`Network error: Unable to reach the API. This may be a CORS issue or network problem. Check your internet connection.`)
    }
    throw err
  }
}

async function fetchJson(url, init = {}) {
  return fetchWithTimeout(url, init, API_TIMEOUT)
}

async function fetchJsonOrNull(url, init = {}) {
  try {
    return await fetchJson(url, init)
  } catch (err) {
    console.warn(`Failed to fetch ${url}:`, err.message)
    return null
  }
}

function uniqueByAddress(pairs) {
  const seen = new Set()
  return pairs.filter((pair) => {
    const key = `${pair.address}:${pair.pairAddress}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

function toFiniteNumber(value) {
  if (value == null || value === '') return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function toPercentNumber(value) {
  const num = toFiniteNumber(value)
  if (num == null) return null
  // Some sources/models return 0-1 fraction instead of 0-100 percent.
  if (num > 0 && num <= 1) return num * 100
  return num
}

function firstFinite(...values) {
  for (const value of values) {
    const num = toFiniteNumber(value)
    if (num !== null) return num
  }
  return null
}

function normalizeRugcheckSignals(rugcheckPayload) {
  if (!rugcheckPayload || typeof rugcheckPayload !== 'object') {
    return {
      top_10_holder_percentage: null,
      lp_status: 'UNKNOWN',
      warnings: [],
      risk_flags: [],
      source_meta: { source: 'RugCheck', confidence: 'LOW', timestamp: new Date().toISOString() },
    }
  }

  const signals = {
    top_10_holder_percentage: null,
    lp_status: 'UNKNOWN',
    warnings: [],
    risk_flags: [],
    source_meta: { source: 'RugCheck', confidence: 'MEDIUM', timestamp: new Date().toISOString() },
  }

  // Extract top 10 holder percentage from holders data
  if (rugcheckPayload.holders && Array.isArray(rugcheckPayload.holders)) {
    const top10 = rugcheckPayload.holders.slice(0, 10)
    const top10Total = top10.reduce((sum, h) => {
      const pct = firstFinite(
        h.percentage,
        h.percent,
        h.supply_percentage,
        h.share,
      )
      return sum + (pct ?? 0)
    }, 0)
    if (Number.isFinite(top10Total) && top10Total > 0) {
      signals.top_10_holder_percentage = toPercentNumber(top10Total)
      signals.source_meta.confidence = 'HIGH'
    }
  }

  // Extract LP status from token/markets data
  const token = rugcheckPayload.token || {}
  const markets = rugcheckPayload.markets || []
  const primaryMarket = markets[0] || {}

  // Check for LP lock/burn status
  if (token.lpLocked === true || primaryMarket.lpLocked === true) {
    signals.lp_status = 'LOCKED'
  } else if (token.lpBurned === true || primaryMarket.lpBurned === true) {
    signals.lp_status = 'BURNED'
  } else if (token.mintAuthority != null || token.freezeAuthority != null) {
    // If authorities exist, LP is likely unlockable
    signals.lp_status = 'UNLOCKED'
  }

  // Extract warnings and risk flags
  if (Array.isArray(rugcheckPayload.warnings)) {
    signals.warnings = rugcheckPayload.warnings
  }
  if (Array.isArray(rugcheckPayload.riskFlags)) {
    signals.risk_flags = rugcheckPayload.riskFlags
  }

  return signals
}

function normalizeBubblemapsSignals(bubblemapsPayload, liquidityUsd = 0) {
  if (!bubblemapsPayload || typeof bubblemapsPayload !== 'object') {
    return {
      largest_cluster_percentage: null,
      top_3_clusters_percentage: null,
      insider_supply_percentage: null,
      cluster_to_liquidity_ratio: null,
      source_meta: { source: 'Bubblemaps', confidence: 'LOW', timestamp: new Date().toISOString() },
    }
  }

  const signals = {
    largest_cluster_percentage: null,
    top_3_clusters_percentage: null,
    insider_supply_percentage: null,
    cluster_to_liquidity_ratio: null,
    source_meta: { source: 'Bubblemaps', confidence: 'MEDIUM', timestamp: new Date().toISOString() },
  }

  // Try multiple possible response structures
  // Structure 1: Direct clusters array
  let clusters = bubblemapsPayload.clusters || []
  let nodes = bubblemapsPayload.nodes || []

  // Structure 2: Data wrapper (e.g., { data: { clusters: [...] } })
  if (clusters.length === 0 && nodes.length === 0 && bubblemapsPayload.data) {
    clusters = bubblemapsPayload.data.clusters || []
    nodes = bubblemapsPayload.data.nodes || []
  }

  // Structure 3: Map data wrapper (e.g., { mapData: { clusters: [...] } })
  if (clusters.length === 0 && nodes.length === 0 && bubblemapsPayload.mapData) {
    clusters = bubblemapsPayload.mapData.clusters || []
    nodes = bubblemapsPayload.mapData.nodes || []
  }

  // Calculate cluster percentages from clusters array
  if (Array.isArray(clusters) && clusters.length > 0) {
    const sortedClusters = [...clusters]
      .map((c) => {
        // Try multiple field names for percentage
        return (
          firstFinite(
            c.percentage,
            c.percent,
            c.supply_percentage,
            c.supplyPercent,
            c.holdings_percentage,
            c.totalPercentage,
          ) ?? 0
        )
      })
      .filter((p) => Number.isFinite(p) && p > 0)
      .sort((a, b) => b - a)

    if (sortedClusters.length > 0) {
      signals.largest_cluster_percentage = sortedClusters[0]
      signals.top_3_clusters_percentage = sortedClusters.slice(0, 3).reduce((sum, p) => sum + p, 0)
      signals.source_meta.confidence = 'HIGH'
    }
  }

  // Calculate cluster percentages from nodes (if clusters array not available)
  // Group nodes by cluster ID and sum their holdings
  if (Array.isArray(nodes) && nodes.length > 0 && !signals.largest_cluster_percentage) {
    const clusterMap = new Map()
    nodes.forEach((node) => {
      const clusterId = node.clusterId || node.cluster || node.group || 'default'
      const pct =
        firstFinite(
          node.percentage,
          node.percent,
          node.supply_percentage,
          node.balance_percentage,
        ) ?? 0
      if (Number.isFinite(pct) && pct > 0) {
        const current = clusterMap.get(clusterId) || 0
        clusterMap.set(clusterId, current + pct)
      }
    })

    if (clusterMap.size > 0) {
      const sortedClusters = Array.from(clusterMap.values())
        .filter((p) => Number.isFinite(p) && p > 0)
        .sort((a, b) => b - a)

      if (sortedClusters.length > 0) {
        signals.largest_cluster_percentage = sortedClusters[0]
        signals.top_3_clusters_percentage = sortedClusters.slice(0, 3).reduce((sum, p) => sum + p, 0)
        signals.source_meta.confidence = 'HIGH'
      }
    }
  }

  // Calculate insider supply from nodes (creator/team connections)
  if (Array.isArray(nodes) && nodes.length > 0) {
    const insiderNodes = nodes.filter(
      (n) =>
        n.insider === true ||
        n.isCreator === true ||
        n.isTeam === true ||
        n.creator === true ||
        n.team === true ||
        n.label?.toLowerCase().includes('creator') ||
        n.label?.toLowerCase().includes('team') ||
        n.type === 'creator' ||
        n.type === 'team',
    )

    if (insiderNodes.length > 0) {
      const insiderTotal = insiderNodes.reduce((sum, n) => {
        const pct =
          firstFinite(
            n.percentage,
            n.percent,
            n.supply_percentage,
            n.balance_percentage,
          ) ?? 0
        return sum + (Number.isFinite(pct) ? pct : 0)
      }, 0)

      if (Number.isFinite(insiderTotal) && insiderTotal > 0) {
        signals.insider_supply_percentage = insiderTotal
        if (signals.source_meta.confidence !== 'HIGH') {
          signals.source_meta.confidence = 'MEDIUM'
        }
      }
    }
  }

  // Calculate cluster-to-liquidity ratio (risk of coordinated dump)
  // This is a simplified calculation - actual would need market cap
  if (Number.isFinite(signals.largest_cluster_percentage) && signals.largest_cluster_percentage > 0) {
    // If we have liquidity, estimate risk ratio
    // Higher cluster % relative to liquidity = higher dump risk
    if (liquidityUsd > 0) {
      // Simplified: assume cluster can control this % of market cap
      // Actual calculation would need: (cluster_supply * price) / liquidity
      const clusterRiskRatio = signals.largest_cluster_percentage / 100
      signals.cluster_to_liquidity_ratio = clusterRiskRatio
    } else {
      // Without liquidity data, still flag high cluster % as risk
      signals.cluster_to_liquidity_ratio = signals.largest_cluster_percentage > 20 ? 1.5 : 0.5
    }
  }

  // Debug logging in development (remove in production)
  if (import.meta.env.DEV && Object.keys(bubblemapsPayload).length > 0) {
    console.log('[Bubblemaps Debug] Payload keys:', Object.keys(bubblemapsPayload))
    console.log('[Bubblemaps Debug] Clusters found:', clusters.length)
    console.log('[Bubblemaps Debug] Nodes found:', nodes.length)
    console.log('[Bubblemaps Debug] Signals extracted:', signals)
  }

  return signals
}

function computeChartLifecycle(xrayPayload, analysis) {
  const primary = xrayPayload?.dexscreener?.primaryPair || {}
  const liq = analysis?.liquidity_analysis || {}
  const recommendation = String(analysis?.recommendation || 'CAUTION').toUpperCase()

  const launchpadName = String(xrayPayload?.rugcheck?.launchpad?.name || '').toLowerCase()
  const marketType = String(xrayPayload?.rugcheck?.markets?.[0]?.marketType || '').toLowerCase()
  const primaryLiq = toFiniteNumber(primary.liquidityUsd)
  const isLikelyPreBond =
    (primaryLiq === null || primaryLiq <= 0) &&
    (launchpadName.includes('pump') || marketType.includes('pump_fun'))

  if (isLikelyPreBond) {
    return {
      phase: 'PRE_BOND',
      phase_confidence: 'HIGH',
      trend_structure: 'NEUTRAL',
      momentum_status: 'UNKNOWN',
      volume_confirmation: 'UNKNOWN',
      setup_quality_score: 3,
      ape_signal: 'AVOID',
      invalidation: 'Wait for bonding/migration and real DEX liquidity before acting.',
      details:
        'This coin looks pre-bond (on a bonding curve, not yet on a DEX). Wait for real DEX liquidity and volume before making big moves.',
    }
  }

  const pair = primary

  const m5 = toFiniteNumber(pair?.priceChange?.m5) ?? 0
  const h1 = toFiniteNumber(pair?.priceChange?.h1) ?? 0
  const h6 = toFiniteNumber(pair?.priceChange?.h6) ?? 0
  const h24 = toFiniteNumber(pair?.priceChange?.h24) ?? 0

  const h1Buys = toFiniteNumber(pair?.txns?.h1?.buys) ?? 0
  const h1Sells = toFiniteNumber(pair?.txns?.h1?.sells) ?? 0
  const h1Total = h1Buys + h1Sells
  const buyPressure = h1Total > 0 ? h1Buys / h1Total : 0.5

  const liqRatio = toFiniteNumber(liq?.liquidity_to_mcap_ratio)

  let trend_structure = 'NEUTRAL'
  if (h1 > 0 && h6 > 0) trend_structure = 'BULLISH'
  if (h1 < 0 && h6 < 0) trend_structure = 'BEARISH'

  let phase = 'DISCOVERY'
  if (h24 > 80 && h1 > 10) phase = 'EUPHORIA'
  else if (h24 > 20 && h1 >= 0) phase = 'MARKUP'
  else if (h24 > 60 && h1 < 0) phase = 'DISTRIBUTION'
  else if (h24 < -20 && h6 < 0) phase = 'DEATH'
  else if (h24 > 0 && h6 > 0 && h1 < 0) phase = 'REVIVAL'
  else if (Math.abs(h24) < 5 && Math.abs(h1) < 2) phase = 'LAUNCH'

  let momentum_status = 'COOLING'
  if (h1 > 8 && m5 > 0) momentum_status = 'ACCELERATING'
  if (h24 > 60 && h1 < 0) momentum_status = 'EXHAUSTED'
  if (Math.abs(h1) < 1) momentum_status = 'UNKNOWN'

  let volume_confirmation = 'WEAK'
  if (h1Total <= 0) volume_confirmation = 'UNKNOWN'
  else if (buyPressure >= 0.58) volume_confirmation = 'CONFIRMED'
  else if (buyPressure <= 0.42) volume_confirmation = 'DIVERGENCE'

  let setup_quality_score = 5
  if (trend_structure === 'BULLISH') setup_quality_score += 2
  if (trend_structure === 'BEARISH') setup_quality_score -= 2
  if (volume_confirmation === 'CONFIRMED') setup_quality_score += 1
  if (volume_confirmation === 'DIVERGENCE') setup_quality_score -= 1
  if (momentum_status === 'EXHAUSTED') setup_quality_score -= 2
  if (liqRatio !== null && liqRatio < 0.1) setup_quality_score -= 1
  setup_quality_score = Math.max(1, Math.min(10, setup_quality_score))

  let ape_signal = 'WAIT_PULLBACK'
  if (recommendation === 'AVOID') {
    ape_signal = 'AVOID'
  } else if (phase === 'MARKUP' && setup_quality_score >= 7 && volume_confirmation === 'CONFIRMED') {
    ape_signal = 'APE_NOW'
  } else if (phase === 'EUPHORIA' || phase === 'DISTRIBUTION' || phase === 'DEATH') {
    ape_signal = 'AVOID'
  }

  const phase_confidence =
    h1Total > 20 || Math.abs(h24) > 25
      ? 'HIGH'
      : h1Total > 8 || Math.abs(h6) > 10
        ? 'MEDIUM'
        : 'LOW'

  const invalidation =
    ape_signal === 'APE_NOW'
      ? 'If 1h trend turns red with heavy sells, stop and wait.'
      : ape_signal === 'WAIT_PULLBACK'
        ? 'Wait for a clean base and more buyer strength first.'
        : 'Do not chase. Wait for better structure and safer risk.'

  const details = `Phase looks like ${phase}. Trend is ${trend_structure.toLowerCase()} with ${volume_confirmation.toLowerCase()} volume. Best action now is ${ape_signal === 'APE_NOW' ? 'ape small' : ape_signal === 'WAIT_PULLBACK' ? 'wait for pullback' : 'avoid for now'}.`

  return {
    phase,
    phase_confidence,
    trend_structure,
    momentum_status,
    volume_confirmation,
    setup_quality_score,
    ape_signal,
    invalidation,
    details,
  }
}

export async function searchTokens(query) {
  const q = (query || '').trim()
  if (!q) {
    return []
  }

  try {
    const payload = await fetchJson(`${DEXSCREENER_SEARCH_URL}?q=${encodeURIComponent(q)}`)
    const pairs = Array.isArray(payload.pairs) ? payload.pairs : []
    const normalized = uniqueByAddress(pairs.map(normalizeDexPair))
    return normalized.slice(0, 25)
  } catch (err) {
    throw new Error(`Token search failed: ${err.message}`)
  }
}

export async function fetchTokenXRay(tokenAddress) {
  const ca = (tokenAddress || '').trim()
  if (!ca) {
    throw new Error('Token address is required')
  }

  try {
    // Step 2 requirement: concurrent fetches for X-ray data.
    let dexTokenPayload, rugcheckPayload, bubblemapsPayload
    
    try {
      [dexTokenPayload, rugcheckPayload, bubblemapsPayload] = await Promise.all([
        fetchJson(`${DEXSCREENER_TOKEN_URL}/${encodeURIComponent(ca)}`),
        fetchJsonOrNull(`${RUGCHECK_URL}/${encodeURIComponent(ca)}/report`),
        fetchJsonOrNull(`${BUBBLEMAPS_URL}?token=${encodeURIComponent(ca)}`),
      ])
    } catch (err) {
      // Provide more specific error context
      if (err.message.includes('Network error') || err.message.includes('Failed to fetch')) {
        throw new Error(`Unable to connect to token data APIs. This may be a CORS or network issue. Please check your internet connection and browser console for details.`)
      }
      throw err
    }

    const pairs = Array.isArray(dexTokenPayload.pairs) ? dexTokenPayload.pairs : []
    if (pairs.length === 0) {
      const launchpadName = String(rugcheckPayload?.launchpad?.name || '').toLowerCase()
      const marketType = String(rugcheckPayload?.markets?.[0]?.marketType || '').toLowerCase()
      const isLikelyPreBond =
        launchpadName.includes('pump') || marketType.includes('pump_fun')

      if (isLikelyPreBond) {
        throw new Error(
          'No Dex liquidity yet. This token is likely not bonded/migrated yet, so public LP data may be missing.',
        )
      }

      throw new Error(
        'No market data found for this token on DexScreener. The token may not be listed yet or the address may be incorrect.',
      )
    }

    const primaryPair = pairs[0]
    const normalizedPairs = pairs.map(normalizeDexPair)
    const normalizedPrimary = normalizeDexPair(primaryPair)

    // Normalize deterministic signals from RugCheck and Bubblemaps
    const rugcheckSignals = normalizeRugcheckSignals(rugcheckPayload)
    const bubblemapsSignals = normalizeBubblemapsSignals(bubblemapsPayload, normalizedPrimary.liquidityUsd)

    return {
      tokenAddress: ca,
      tokenSymbol: primaryPair.baseToken?.symbol || 'UNKNOWN',
      tokenName: primaryPair.baseToken?.name || 'Unknown Token',
      dexscreener: {
        primaryPair: normalizedPrimary,
        pairs: normalizedPairs,
        raw: dexTokenPayload,
      },
      rugcheck: rugcheckPayload,
      rugcheckSignals,
      bubblemaps: bubblemapsPayload,
      bubblemapsSignals,
      fetchedAt: new Date().toISOString(),
    }
  } catch (err) {
    if (err.message.includes('timed out')) {
      throw new Error(`Token data fetch timed out. Please try again.`)
    }
    throw new Error(`Failed to fetch token data: ${err.message}`)
  }
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function extractJsonObject(rawText) {
  if (typeof rawText !== 'string') return null
  const text = rawText.trim()

  // First attempt: direct JSON parse.
  const direct = safeJsonParse(text)
  if (direct) return direct

  // Second attempt: strip markdown fences.
  const fenced = text.replace(/```json|```/gi, '').trim()
  const fromFenced = safeJsonParse(fenced)
  if (fromFenced) return fromFenced

  // Third attempt: parse the largest object-like segment.
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return safeJsonParse(text.slice(firstBrace, lastBrace + 1))
  }

  return null
}

const TERM_MAP = [
  [/liquidity ratio/gi, 'how easy it is to sell'],
  [/distribution risk/gi, 'risk from who controls most coins'],
  [/distribution/gi, 'who controls most coins'],
  [/renounced contract/gi, 'dev cannot change token rules'],
  [/bundle pattern/gi, 'same group may control many wallets'],
  [/exitability/gi, 'ability to sell when needed'],
  [/market cap/gi, 'total coin value'],
  [/volatility/gi, 'fast price swings'],
  [/rug risk/gi, 'rug pull risk'],
]

function simplifyText(text) {
  if (typeof text !== 'string') return text
  let out = text
  for (const [pattern, replacement] of TERM_MAP) {
    out = out.replace(pattern, replacement)
  }
  return out
}

function deepSimplifyStrings(value) {
  if (Array.isArray(value)) return value.map(deepSimplifyStrings)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, deepSimplifyStrings(item)]),
    )
  }
  return simplifyText(value)
}

function validateAndCoerceAnalysis(analysis) {
  if (!analysis || typeof analysis !== 'object') {
    return null
  }

  const output = { ...analysis }

  // Ensure required top-level fields
  if (typeof output.token_symbol !== 'string') output.token_symbol = 'UNKNOWN'
  if (typeof output.token_address !== 'string') output.token_address = 'N/A'
  if (typeof output.overall_risk_score !== 'number' || output.overall_risk_score < 1 || output.overall_risk_score > 10) {
    output.overall_risk_score = 5
  }
  if (!['BUY', 'CAUTION', 'AVOID'].includes(output.recommendation)) {
    output.recommendation = 'CAUTION'
  }
  if (typeof output.summary !== 'string') output.summary = 'Analysis unavailable.'

  // Validate three_pillars
  if (!output.three_pillars || typeof output.three_pillars !== 'object') {
    output.three_pillars = {
      volume: { score: 0, status: 'UNKNOWN', details: '', red_flags: [], green_flags: [] },
      narrative: { score: 0, status: 'UNKNOWN', details: '', red_flags: [], green_flags: [] },
      distribution: { score: 0, status: 'UNKNOWN', details: '', red_flags: [], green_flags: [], top_10_holder_percentage: null },
    }
  } else {
    const pillars = output.three_pillars
    for (const key of ['volume', 'narrative', 'distribution']) {
      if (!pillars[key] || typeof pillars[key] !== 'object') {
        pillars[key] = key === 'distribution'
          ? { score: 0, status: 'UNKNOWN', details: '', red_flags: [], green_flags: [], top_10_holder_percentage: null }
          : { score: 0, status: 'UNKNOWN', details: '', red_flags: [], green_flags: [] }
      }
      const pillar = pillars[key]
      if (typeof pillar.score !== 'number' || pillar.score < 1 || pillar.score > 10) pillar.score = 5
      if (typeof pillar.status !== 'string') pillar.status = 'UNKNOWN'
      if (typeof pillar.details !== 'string') pillar.details = ''
      if (!Array.isArray(pillar.red_flags)) pillar.red_flags = []
      if (!Array.isArray(pillar.green_flags)) pillar.green_flags = []
      if (key === 'distribution') {
        if (!Number.isFinite(pillar.top_10_holder_percentage)) {
          pillar.top_10_holder_percentage = null
        }
        // Validate new insider/bundle fields if present
        if (!Number.isFinite(pillar.largest_cluster_percentage)) {
          pillar.largest_cluster_percentage = null
        }
        if (!Number.isFinite(pillar.insider_supply_percentage)) {
          pillar.insider_supply_percentage = null
        }
      }
    }
  }

  // Validate liquidity_analysis
  if (!output.liquidity_analysis || typeof output.liquidity_analysis !== 'object') {
    output.liquidity_analysis = {
      market_cap: 0,
      liquidity: 0,
      liquidity_ratio: 0,
      liquidity_to_mcap_ratio: null,
      lp_status: 'UNKNOWN',
      status: 'UNKNOWN',
      details: '',
      red_flags: [],
      green_flags: [],
    }
  } else {
    const liq = output.liquidity_analysis
    if (typeof liq.market_cap !== 'number') liq.market_cap = 0
    if (typeof liq.liquidity !== 'number') liq.liquidity = 0
    if (typeof liq.liquidity_ratio !== 'number') liq.liquidity_ratio = 0
    if (!Number.isFinite(liq.liquidity_to_mcap_ratio)) liq.liquidity_to_mcap_ratio = null
    const lpStatus = String(liq.lp_status || 'UNKNOWN').toUpperCase()
    if (!['BURNED', 'LOCKED', 'UNLOCKED', 'UNKNOWN'].includes(lpStatus)) {
      liq.lp_status = 'UNKNOWN'
    } else {
      liq.lp_status = lpStatus
    }
    if (typeof liq.status !== 'string') liq.status = 'UNKNOWN'
    if (typeof liq.details !== 'string') liq.details = ''
    if (!Array.isArray(liq.red_flags)) liq.red_flags = []
    if (!Array.isArray(liq.green_flags)) liq.green_flags = []
  }

  // Validate security_checks
  if (!output.security_checks || typeof output.security_checks !== 'object') {
    output.security_checks = {
      contract_renounced: false,
      dev_wallet_history: 'Unknown',
      dev_selling_while_promoting: null,
      dev_sell_evidence: [],
      creator_wallet_empty: null,
      lp_status: 'UNKNOWN',
      status: 'UNKNOWN',
      details: '',
      red_flags: [],
      green_flags: [],
    }
  } else {
    const sec = output.security_checks
    if (typeof sec.contract_renounced !== 'boolean') sec.contract_renounced = false
    if (typeof sec.dev_wallet_history !== 'string') sec.dev_wallet_history = 'Unknown'
    if (sec.dev_selling_while_promoting !== true && sec.dev_selling_while_promoting !== false) {
      sec.dev_selling_while_promoting = null
    }
    if (!Array.isArray(sec.dev_sell_evidence)) sec.dev_sell_evidence = []
    if (sec.creator_wallet_empty !== true && sec.creator_wallet_empty !== false) {
      sec.creator_wallet_empty = null
    }
    const lpStatus = String(sec.lp_status || 'UNKNOWN').toUpperCase()
    if (!['BURNED', 'LOCKED', 'UNLOCKED', 'UNKNOWN'].includes(lpStatus)) {
      sec.lp_status = 'UNKNOWN'
    } else {
      sec.lp_status = lpStatus
    }
    if (typeof sec.status !== 'string') sec.status = 'UNKNOWN'
    if (typeof sec.details !== 'string') sec.details = ''
    if (!Array.isArray(sec.red_flags)) sec.red_flags = []
    if (!Array.isArray(sec.green_flags)) sec.green_flags = []
  }

  // Validate chart_lifecycle
  if (!output.chart_lifecycle || typeof output.chart_lifecycle !== 'object') {
    output.chart_lifecycle = {
      phase: 'UNKNOWN',
      phase_confidence: 'LOW',
      trend_structure: 'NEUTRAL',
      momentum_status: 'UNKNOWN',
      volume_confirmation: 'UNKNOWN',
      setup_quality_score: 5,
      ape_signal: 'WAIT_PULLBACK',
      invalidation: 'Wait for clearer trend.',
      details: 'Chart data is limited right now.',
    }
  } else {
    const chart = output.chart_lifecycle
    if (!['LAUNCH', 'DISCOVERY', 'MARKUP', 'EUPHORIA', 'DISTRIBUTION', 'DEATH', 'REVIVAL', 'UNKNOWN'].includes(chart.phase)) {
      chart.phase = 'UNKNOWN'
    }
    if (!['LOW', 'MEDIUM', 'HIGH'].includes(chart.phase_confidence)) chart.phase_confidence = 'LOW'
    if (!['BULLISH', 'NEUTRAL', 'BEARISH'].includes(chart.trend_structure)) chart.trend_structure = 'NEUTRAL'
    if (!['ACCELERATING', 'COOLING', 'EXHAUSTED', 'UNKNOWN'].includes(chart.momentum_status)) chart.momentum_status = 'UNKNOWN'
    if (!['CONFIRMED', 'WEAK', 'DIVERGENCE', 'UNKNOWN'].includes(chart.volume_confirmation)) chart.volume_confirmation = 'UNKNOWN'
    if (!Number.isFinite(chart.setup_quality_score)) chart.setup_quality_score = 5
    chart.setup_quality_score = Math.max(1, Math.min(10, chart.setup_quality_score))
    if (!['APE_NOW', 'WAIT_PULLBACK', 'AVOID'].includes(chart.ape_signal)) chart.ape_signal = 'WAIT_PULLBACK'
    if (typeof chart.invalidation !== 'string') chart.invalidation = 'Wait for clearer trend.'
    if (typeof chart.details !== 'string') chart.details = 'Chart data is limited right now.'
  }

  // Validate actionable_guidance
  if (!output.actionable_guidance || typeof output.actionable_guidance !== 'object') {
    output.actionable_guidance = {
      if_buying: { position_size: 'N/A', entry_strategy: 'N/A', profit_targets: 'N/A', stop_loss: 'N/A' },
      if_avoiding: { reason: 'N/A', alternative: 'N/A' },
    }
  } else {
    if (!output.actionable_guidance.if_buying || typeof output.actionable_guidance.if_buying !== 'object') {
      output.actionable_guidance.if_buying = {
        position_size: 'N/A',
        entry_strategy: 'N/A',
        profit_targets: 'N/A',
        stop_loss: 'N/A',
      }
    }
    if (!output.actionable_guidance.if_avoiding || typeof output.actionable_guidance.if_avoiding !== 'object') {
      output.actionable_guidance.if_avoiding = { reason: 'N/A', alternative: 'N/A' }
    }
  }

  // Validate flag arrays
  if (!Array.isArray(output.all_red_flags)) output.all_red_flags = []
  if (!Array.isArray(output.all_green_flags)) output.all_green_flags = []

  return output
}

function computeDeterministicRiskScore({
  liquidityToMcapRatio,
  top10Pct,
  largestClusterPct,
  insiderSupplyPct,
  clusterToLiqRatio,
  lpStatus,
}) {
  let score = 5

  // Liquidity vs market cap (exit risk)
  if (Number.isFinite(liquidityToMcapRatio)) {
    if (liquidityToMcapRatio < 0.05) {
      score = 9
    } else if (liquidityToMcapRatio < 0.1) {
      score = Math.max(score, 7)
    } else if (liquidityToMcapRatio > 0.3) {
      score = Math.min(score, 4)
    }
  }

  // Top 10 holder concentration
  if (Number.isFinite(top10Pct)) {
    if (top10Pct > 35) {
      score = Math.max(score, 8)
    } else if (top10Pct > 30) {
      score = Math.max(score, 7)
    } else if (top10Pct < 20) {
      score = Math.min(score, 4)
    }
  }

  // Bundler / largest cluster control
  if (Number.isFinite(largestClusterPct) && largestClusterPct > 20) {
    score = Math.max(score, 8)
  }

  // Insider / team-linked supply
  if (Number.isFinite(insiderSupplyPct) && insiderSupplyPct > 15) {
    score = Math.max(score, 8)
  }

  // Cluster-to-liquidity dump risk
  if (Number.isFinite(clusterToLiqRatio) && clusterToLiqRatio > 1) {
    score = Math.max(score, 8)
  }

  // LP status – unlocked is severe, burned is safer
  const lp = String(lpStatus || 'UNKNOWN').toUpperCase()
  if (lp === 'UNLOCKED') {
    score = Math.max(score, 9)
  } else if (lp === 'BURNED') {
    score = Math.min(score, 3)
  }

  return Math.max(1, Math.min(10, Math.round(score)))
}

function enforceDeterministicRiskRules(analysis, xrayPayload) {
  const output = analysis && typeof analysis === 'object' ? { ...analysis } : {}
  const liquidity = output.liquidity_analysis && typeof output.liquidity_analysis === 'object'
    ? { ...output.liquidity_analysis }
    : {}
  const distribution = output.three_pillars?.distribution && typeof output.three_pillars.distribution === 'object'
    ? { ...output.three_pillars.distribution }
    : {}
  const security = output.security_checks && typeof output.security_checks === 'object'
    ? { ...output.security_checks }
    : {}

  // Extract deterministic signals from xrayPayload
  const rugcheckSignals = xrayPayload?.rugcheckSignals || {}
  const bubblemapsSignals = xrayPayload?.bubblemapsSignals || {}

  // Calculate liquidity_to_mcap_ratio if missing
  const marketCap = Number(liquidity.market_cap || 0)
  const liquidityUsd = Number(liquidity.liquidity || 0)
  const liquidityToMcapRatio =
    marketCap > 0 ? liquidityUsd / marketCap : liquidity.liquidity_to_mcap_ratio || null
  liquidity.liquidity_to_mcap_ratio = liquidityToMcapRatio

  // Hard threshold: liquidity_to_mcap_ratio < 0.05 => mandatory high-risk
  if (Number.isFinite(liquidityToMcapRatio) && liquidityToMcapRatio < 0.05) {
    if (!Array.isArray(liquidity.red_flags)) liquidity.red_flags = []
    if (!liquidity.red_flags.includes('Liquidity too low relative to market cap (high exit risk)')) {
      liquidity.red_flags.push('Liquidity too low relative to market cap (high exit risk)')
    }
    if (liquidity.status !== 'DANGEROUS') {
      liquidity.status = 'DANGEROUS'
    }
  }

  // Hard threshold: top_10_holder_percentage > 30 => mandatory centralization red flag
  // Use source-derived value if available, otherwise fall back to LLM output
  const top10PctRaw = firstFinite(
    rugcheckSignals.top_10_holder_percentage,
    distribution.top_10_holder_percentage,
  )
  const top10Pct = toPercentNumber(top10PctRaw)
  if (Number.isFinite(top10Pct) && top10Pct > 30) {
    if (!Array.isArray(distribution.red_flags)) distribution.red_flags = []
    if (!distribution.red_flags.some((f) => f.includes('Top 10 holders control'))) {
      distribution.red_flags.push(
        `Top 10 holders control ${top10Pct.toFixed(1)}% of supply (severe centralization risk)`,
      )
    }
    if (distribution.status !== 'CRITICAL' && distribution.status !== 'SUSPICIOUS') {
      distribution.status = 'CRITICAL'
    }
  }
  if (Number.isFinite(top10Pct) && top10Pct < 20 && Array.isArray(distribution.red_flags)) {
    // Remove stale/high-concentration wording when normalized top10 data says concentration is low.
    distribution.red_flags = distribution.red_flags.filter(
      (flag) =>
        !/top\s*10 holders control|high concentration of tokens in top holders|high concentration of tokens in top wallets/i.test(
          String(flag),
        ),
    )
  }
  // Update distribution with source-derived value if available
  const sourceTop10Pct = toPercentNumber(rugcheckSignals.top_10_holder_percentage)
  if (sourceTop10Pct !== null) {
    distribution.top_10_holder_percentage = sourceTop10Pct
  } else if (top10Pct !== null) {
    distribution.top_10_holder_percentage = top10Pct
  }

  // Hard threshold: largest_cluster_percentage > 20 => force CRITICAL distribution + AVOID
  const largestClusterPct = toFiniteNumber(bubblemapsSignals.largest_cluster_percentage)
  if (Number.isFinite(largestClusterPct) && largestClusterPct > 20) {
    if (!Array.isArray(distribution.red_flags)) distribution.red_flags = []
    if (!distribution.red_flags.some((f) => f.includes('Largest cluster controls'))) {
      distribution.red_flags.push(
        `Largest cluster controls ${largestClusterPct.toFixed(1)}% of supply (bundler/coordinated control risk)`,
      )
    }
    distribution.status = 'CRITICAL'
    if (output.recommendation !== 'AVOID') {
      output.recommendation = 'AVOID'
    }
  }

  // Hard threshold: insider_supply_percentage > 15 => mandatory insider centralization red flag
  const insiderSupplyPct = toFiniteNumber(bubblemapsSignals.insider_supply_percentage)
  if (Number.isFinite(insiderSupplyPct) && insiderSupplyPct > 15) {
    if (!Array.isArray(distribution.red_flags)) distribution.red_flags = []
    if (!distribution.red_flags.some((f) => f.includes('Insider supply'))) {
      distribution.red_flags.push(
        `Insider/team-linked wallets control ${insiderSupplyPct.toFixed(1)}% of supply (insider centralization risk)`,
      )
    }
    if (distribution.status !== 'CRITICAL') {
      distribution.status = 'CRITICAL'
    }
  }

  // Hard threshold: cluster_to_liquidity_ratio > 1 => severe dump/exit-risk warning
  const clusterToLiqRatio = toFiniteNumber(bubblemapsSignals.cluster_to_liquidity_ratio)
  if (Number.isFinite(clusterToLiqRatio) && clusterToLiqRatio > 1) {
    if (!Array.isArray(liquidity.red_flags)) liquidity.red_flags = []
    if (!liquidity.red_flags.some((f) => f.includes('Cluster can dump more than liquidity'))) {
      liquidity.red_flags.push(
        'Largest cluster can dump more than available liquidity (severe exit risk)',
      )
    }
    if (liquidity.status !== 'DANGEROUS') {
      liquidity.status = 'DANGEROUS'
    }
  }

  // Hard threshold: lp_status = UNLOCKED => mandatory severe liquidity-rug warning
  // Use source-derived value if available, otherwise fall back to LLM output
  const lpStatusSource = rugcheckSignals.lp_status || security.lp_status || liquidity.lp_status || 'UNKNOWN'
  const lpStatus = String(lpStatusSource).toUpperCase()
  if (lpStatus === 'UNLOCKED') {
    if (!Array.isArray(security.red_flags)) security.red_flags = []
    if (!security.red_flags.some((f) => f.includes('Liquidity pool is unlocked'))) {
      security.red_flags.push('Liquidity pool is unlocked (developer can rug pull at any time)')
    }
    if (security.status !== 'CRITICAL') {
      security.status = 'CRITICAL'
    }
    // Force recommendation to AVOID if LP is unlocked
    if (output.recommendation !== 'AVOID') {
      output.recommendation = 'AVOID'
    }
  }

  // Update security/liquidity with source-derived LP status if available
  if (rugcheckSignals.lp_status && rugcheckSignals.lp_status !== 'UNKNOWN') {
    security.lp_status = rugcheckSignals.lp_status
    liquidity.lp_status = rugcheckSignals.lp_status
  }

  // Compute a fully deterministic overall risk score from hard signals only.
  let deterministicRiskScore = computeDeterministicRiskScore({
    liquidityToMcapRatio,
    top10Pct,
    largestClusterPct,
    insiderSupplyPct,
    clusterToLiqRatio,
    lpStatus,
  })

  // Reconcile recommendation with deterministic overrides (AI can be stricter, never looser)
  const hasCriticalRisk =
    (Number.isFinite(liquidityToMcapRatio) && liquidityToMcapRatio < 0.05) ||
    (Number.isFinite(top10Pct) && top10Pct > 30) ||
    (Number.isFinite(largestClusterPct) && largestClusterPct > 20) ||
    (Number.isFinite(insiderSupplyPct) && insiderSupplyPct > 15) ||
    lpStatus === 'UNLOCKED'

  if (hasCriticalRisk) {
    if (output.recommendation !== 'AVOID') {
      output.recommendation = 'AVOID'
    }
    if (deterministicRiskScore < 8) {
      deterministicRiskScore = 8
    }
  }

  output.overall_risk_score = deterministicRiskScore

  // Update nested objects
  if (output.three_pillars) {
    output.three_pillars.distribution = distribution
  }
  output.liquidity_analysis = liquidity
  output.security_checks = security
  output.chart_lifecycle = computeChartLifecycle(xrayPayload, output)

  // If this looks pre-bond, make sure the summary clearly says so.
  if (String(output.chart_lifecycle?.phase || '').toUpperCase() === 'PRE_BOND') {
    const prebondLine =
      'This coin looks pre-bond (not yet trading on a DEX). Always wait for real DEX liquidity and volume before making big moves.'
    if (typeof output.summary === 'string' && output.summary.trim()) {
      output.summary = `${output.summary.trim()} ${prebondLine}`
    } else {
      output.summary = prebondLine
    }
  }

  return output
}

function normalizeSecurityEvidence(analysis, xrayPayload) {
  const output = analysis && typeof analysis === 'object' ? { ...analysis } : {}
  const security = output.security_checks && typeof output.security_checks === 'object'
    ? { ...output.security_checks }
    : {}

  const evidence = Array.isArray(security.dev_sell_evidence) ? security.dev_sell_evidence : []
  const hasEvidence = evidence.length > 0
  const creatorBalanceRaw = xrayPayload?.rugcheck?.creatorBalance
  const creatorBalance = Number(creatorBalanceRaw)
  const creatorWalletEmpty = Number.isFinite(creatorBalance) && creatorBalance === 0
  security.creator_wallet_empty = Number.isFinite(creatorBalance) ? creatorWalletEmpty : null

  // Hard rule: never claim creator sold without explicit evidence.
  if (security.dev_selling_while_promoting === true && !hasEvidence) {
    security.dev_selling_while_promoting = null
  }

  const notes = []
  if (creatorWalletEmpty) {
    notes.push('Creator wallet balance is currently 0 tokens.')
  }
  if (security.dev_selling_while_promoting !== true) {
    notes.push('No direct on-chain proof of creator selling was found in current data.')
  }
  notes.push(
    'Data source: RugCheck + Solana RPC snapshot. Empty creator wallet is a red flag, but not standalone proof of a creator sell.',
  )

  const existingDetails = typeof security.details === 'string' ? security.details.trim() : ''
  security.details = [existingDetails, ...notes].filter(Boolean).join(' ')

  output.security_checks = security
  return output
}

export async function evaluateTokenWithLLM(xrayPayload) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    throw new Error('Missing or invalid VITE_GEMINI_API_KEY in .env.local. Please set your Gemini API key.')
  }

  const userPayload = {
    token_address: xrayPayload.tokenAddress,
    token_symbol: xrayPayload.tokenSymbol,
    token_name: xrayPayload.tokenName,
    fetched_at: xrayPayload.fetchedAt,
    dexscreener: xrayPayload.dexscreener,
    rugcheck: xrayPayload.rugcheck,
    bubblemaps: xrayPayload.bubblemaps,
  }

  const requestBody = {
    systemInstruction: {
      parts: [{ text: ANALYZER_SYSTEM_PROMPT }],
    },
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `Analyze this token data and return JSON only:\n${JSON.stringify(userPayload)}`,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
    },
  }

  let lastError = null

  for (const model of GEMINI_MODELS) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const completion = await fetchWithTimeout(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
          },
          LLM_TIMEOUT,
        )

        const content =
          completion?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || ''
        const parsed = extractJsonObject(content)

        if (!parsed) {
          throw new Error('Model returned non-JSON content')
        }

        const simplified = deepSimplifyStrings(parsed)
        const validated = validateAndCoerceAnalysis(simplified)
        if (!validated) {
          throw new Error('AI returned invalid or malformed analysis structure')
        }
        const withEvidence = normalizeSecurityEvidence(validated, xrayPayload)
        return enforceDeterministicRiskRules(withEvidence, xrayPayload)
      } catch (err) {
        lastError = err
        const msg = String(err?.message || '')

        // Retry once for transient failures.
        const retryable =
          msg.includes('timed out') ||
          msg.includes('(429)') ||
          msg.includes('(500)') ||
          msg.includes('(502)') ||
          msg.includes('(503)') ||
          msg.includes('Network error')

        if (retryable && attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 700))
          continue
        }

        // If model is missing/unavailable, try the next model.
        const modelUnavailable = msg.includes('(404)')
        if (modelUnavailable) {
          break
        }

        // Auth/config errors should fail fast.
        if (msg.includes('(401)') || msg.includes('(403)')) {
          throw new Error('AI analysis authentication failed. Please check your API key configuration.')
        }
      }
    }
  }

  const finalMessage = String(lastError?.message || 'Unknown AI error')
  if (finalMessage.includes('timed out')) {
    throw new Error(`AI analysis timed out after ${LLM_TIMEOUT / 1000}s. Please try again.`)
  }
  if (finalMessage.includes('(429)')) {
    throw new Error('AI is rate-limited right now. Please wait a few seconds and try again.')
  }
  throw new Error(`AI analysis failed: ${finalMessage}`)
}
