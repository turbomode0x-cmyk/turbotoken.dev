import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  evaluateTokenWithLLM,
  fetchTokenXRay,
  searchTokens,
  // Reuse the same deterministic risk scoring used after LLM analysis
  // so the ENTRY TIMING bar does not jump between fallback and final views.
  computeDeterministicRiskScore,
} from '../services/apiService.js'

function toFiniteNumber(value) {
  if (value == null || value === '') return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

const XRAY_CACHE_TTL_MS = 60_000
const XRAY_CACHE_STORAGE_KEY = 'turbotoken:xray-cache:v1'
const XRAY_MEMORY_CACHE = new Map()
let xrayCacheHydrated = false

function hydrateXrayCacheFromStorage() {
  if (typeof window === 'undefined' || xrayCacheHydrated) return
  xrayCacheHydrated = true
  try {
    const raw = window.localStorage.getItem(XRAY_CACHE_STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return
    const now = Date.now()
    Object.entries(parsed).forEach(([ca, entry]) => {
      if (!entry || typeof entry !== 'object') return
      const ts = Number(entry.fetchedAt)
      if (!Number.isFinite(ts) || now - ts > XRAY_CACHE_TTL_MS) return
      XRAY_MEMORY_CACHE.set(ca, {
        xrayPayload: entry.xrayPayload,
        analysis: entry.analysis,
        fetchedAt: ts,
      })
    })
  } catch (err) {
    console.warn('[useTokenData] Failed to hydrate X-Ray cache from storage', err)
  }
}

function persistXrayCacheToStorage() {
  if (typeof window === 'undefined') return
  try {
    const now = Date.now()
    const snapshot = {}
    for (const [ca, entry] of XRAY_MEMORY_CACHE.entries()) {
      if (!entry || !entry.fetchedAt || now - entry.fetchedAt > XRAY_CACHE_TTL_MS) continue
      snapshot[ca] = {
        xrayPayload: entry.xrayPayload,
        analysis: entry.analysis,
        fetchedAt: entry.fetchedAt,
      }
    }
    window.localStorage.setItem(XRAY_CACHE_STORAGE_KEY, JSON.stringify(snapshot))
  } catch (err) {
    console.warn('[useTokenData] Failed to persist X-Ray cache to storage', err)
  }
}

function emptyAnalysis(tokenAddress, summaryMessage = 'No analysis available yet.') {
  return {
    token_symbol: 'UNKNOWN',
    token_address: tokenAddress || 'N/A',
    overall_risk_score: 0,
    recommendation: 'CAUTION',
    summary: summaryMessage,
    three_pillars: {
      volume: { score: 0, status: 'UNKNOWN', details: '', red_flags: [], green_flags: [] },
      narrative: { score: 0, status: 'UNKNOWN', details: '', red_flags: [], green_flags: [] },
      distribution: { score: 0, status: 'UNKNOWN', details: '', red_flags: [], green_flags: [], top_10_holder_percentage: null },
    },
    liquidity_analysis: {
      market_cap: 0,
      liquidity: 0,
      liquidity_ratio: 0,
      liquidity_to_mcap_ratio: null,
      lp_status: 'UNKNOWN',
      status: 'UNKNOWN',
      details: '',
      red_flags: [],
      green_flags: [],
    },
    security_checks: {
      contract_renounced: false,
      dev_wallet_history: 'Unknown',
      dev_selling_while_promoting: null,
      dev_sell_evidence: [],
      creator_wallet_empty: null,
      status: 'UNKNOWN',
      details: '',
      red_flags: [],
      green_flags: [],
    },
    chart_lifecycle: {
      phase: 'UNKNOWN',
      phase_confidence: 'LOW',
      trend_structure: 'NEUTRAL',
      momentum_status: 'UNKNOWN',
      volume_confirmation: 'UNKNOWN',
      setup_quality_score: 5,
      ape_signal: 'WAIT_PULLBACK',
      invalidation: 'Wait for clearer trend.',
      details: 'Chart data is limited right now.',
    },
    actionable_guidance: {
      if_buying: {
        position_size: 'N/A',
        entry_strategy: 'N/A',
        profit_targets: 'N/A',
        stop_loss: 'N/A',
      },
      if_avoiding: {
        reason: 'N/A',
        alternative: 'N/A',
      },
    },
    all_red_flags: [],
    all_green_flags: [],
  }
}

function fallbackAnalysisFromXray(xrayPayload) {
  const pair = xrayPayload?.dexscreener?.primaryPair || {}
  const rugcheck = xrayPayload?.rugcheck || {}
  const rugcheckSignals = xrayPayload?.rugcheckSignals || {}
  const bubblemapsSignals = xrayPayload?.bubblemapsSignals || {}
  const marketCap = Number(pair.marketCap || 0)
  const liquidity = Number(pair.liquidityUsd || 0)
  const liquidityRatio = marketCap > 0 ? liquidity / marketCap : 0
  const highRisk = liquidityRatio > 0 && liquidityRatio < 0.1
  const creatorBalance = Number(rugcheck.creatorBalance)
  const creatorWalletEmpty = Number.isFinite(creatorBalance) ? creatorBalance === 0 : null
  const creatorDetails =
    creatorWalletEmpty === true
      ? 'Creator wallet balance is currently 0 tokens.'
      : creatorWalletEmpty === false
        ? 'Creator wallet currently holds tokens.'
        : 'Creator wallet balance is unknown.'

  // Compute distribution risk from deterministic signals
  const top10Pct = toFiniteNumber(rugcheckSignals.top_10_holder_percentage)
  const largestClusterPct = toFiniteNumber(bubblemapsSignals.largest_cluster_percentage)
  const insiderSupplyPct = toFiniteNumber(bubblemapsSignals.insider_supply_percentage)
  const clusterToLiqRatio = toFiniteNumber(bubblemapsSignals.cluster_to_liquidity_ratio)

  const h1 = toFiniteNumber(pair?.priceChange?.h1) ?? 0
  const h6 = toFiniteNumber(pair?.priceChange?.h6) ?? 0
  const h24 = toFiniteNumber(pair?.priceChange?.h24) ?? 0
  const m5 = toFiniteNumber(pair?.priceChange?.m5) ?? 0
  const h1Buys = toFiniteNumber(pair?.txns?.h1?.buys) ?? 0
  const h1Sells = toFiniteNumber(pair?.txns?.h1?.sells) ?? 0

  const distributionRedFlags = []
  let distributionStatus = 'UNKNOWN'
  let distributionScore = 5

  if (Number.isFinite(top10Pct) && top10Pct > 30) {
    distributionRedFlags.push(`Top 10 holders control ${top10Pct.toFixed(1)}% of supply`)
    distributionStatus = 'CRITICAL'
    distributionScore = 9
  } else if (Number.isFinite(top10Pct) && top10Pct > 20) {
    distributionRedFlags.push(`Top 10 holders control ${top10Pct.toFixed(1)}% of supply`)
    distributionStatus = 'SUSPICIOUS'
    distributionScore = 7
  }

  if (Number.isFinite(largestClusterPct) && largestClusterPct > 20) {
    distributionRedFlags.push(`Largest cluster controls ${largestClusterPct.toFixed(1)}% of supply`)
    distributionStatus = 'CRITICAL'
    distributionScore = 9
  }

  if (Number.isFinite(insiderSupplyPct) && insiderSupplyPct > 15) {
    distributionRedFlags.push(`Insider/team-linked wallets control ${insiderSupplyPct.toFixed(1)}% of supply`)
    distributionStatus = 'CRITICAL'
    distributionScore = 9
  }

  const liquidityRedFlags = highRisk ? ['Low liquidity relative to market cap'] : []
  if (Number.isFinite(clusterToLiqRatio) && clusterToLiqRatio > 1) {
    liquidityRedFlags.push('Largest cluster can dump more than available liquidity')
  }

  // Determine overall risk and recommendation using the exact same deterministic rules
  // that are enforced after LLM analysis. This keeps ENTRY TIMING stable.
  const lpStatus = rugcheckSignals.lp_status || 'UNKNOWN'
  const deterministicRisk = computeDeterministicRiskScore({
    liquidityToMcapRatio: liquidityRatio > 0 ? liquidityRatio : null,
    top10Pct,
    largestClusterPct,
    insiderSupplyPct,
    clusterToLiqRatio,
    lpStatus,
  })

  const hasCriticalRisk =
    (Number.isFinite(liquidityRatio) && liquidityRatio < 0.05) ||
    (Number.isFinite(top10Pct) && top10Pct > 30) ||
    (Number.isFinite(largestClusterPct) && largestClusterPct > 20) ||
    (Number.isFinite(insiderSupplyPct) && insiderSupplyPct > 15) ||
    (lpStatus && String(lpStatus).toUpperCase() === 'UNLOCKED')

  const recommendation = hasCriticalRisk ? 'AVOID' : highRisk ? 'CAUTION' : 'CAUTION'

  const trend = h1 > 0 && h6 > 0 ? 'BULLISH' : h1 < 0 && h6 < 0 ? 'BEARISH' : 'NEUTRAL'
  const phase =
    h24 > 80 ? 'EUPHORIA' : h24 > 20 ? 'MARKUP' : h24 < -20 ? 'DEATH' : Math.abs(h24) < 5 ? 'LAUNCH' : 'DISCOVERY'
  const volumeConfirmation =
    h1Buys + h1Sells <= 0 ? 'UNKNOWN' : h1Buys > h1Sells ? 'CONFIRMED' : 'DIVERGENCE'
  const apeSignal =
    recommendation === 'AVOID'
      ? 'AVOID'
      : phase === 'MARKUP' && trend === 'BULLISH' && volumeConfirmation === 'CONFIRMED'
        ? 'APE_NOW'
        : 'WAIT_PULLBACK'

  return {
    ...emptyAnalysis(xrayPayload?.tokenAddress),
    token_symbol: xrayPayload?.tokenSymbol || 'UNKNOWN',
    token_address: xrayPayload?.tokenAddress || 'N/A',
    summary:
      'Live market data loaded, but AI analysis is temporarily unavailable. Review liquidity, distribution, and security metrics before acting.',
    overall_risk_score: deterministicRisk,
    recommendation,
    three_pillars: {
      volume: { score: 5, status: 'UNKNOWN', details: 'Volume analysis unavailable without AI.', red_flags: [], green_flags: [] },
      narrative: { score: 5, status: 'UNKNOWN', details: 'Narrative analysis unavailable without AI.', red_flags: [], green_flags: [] },
      distribution: {
        score: distributionScore,
        status: distributionStatus,
        details:
          distributionRedFlags.length > 0
            ? `Distribution risk detected: ${distributionRedFlags.join('; ')}`
            : 'Distribution analysis computed from source data.',
        red_flags: distributionRedFlags,
        green_flags: [],
        top_10_holder_percentage: Number.isFinite(top10Pct) ? top10Pct : null,
      },
    },
    liquidity_analysis: {
      market_cap: marketCap,
      liquidity,
      liquidity_ratio: liquidityRatio,
      liquidity_to_mcap_ratio: liquidityRatio,
      lp_status: rugcheckSignals.lp_status || 'UNKNOWN',
      status: hasCriticalLiquidity ? 'DANGEROUS' : highRisk ? 'RISKY' : 'UNKNOWN',
      details: 'Computed locally from DexScreener while AI is unavailable.',
      red_flags: liquidityRedFlags,
      green_flags: [],
    },
    security_checks: {
      contract_renounced: rugcheck?.token?.mintAuthority == null && rugcheck?.token?.freezeAuthority == null,
      dev_wallet_history: 'Unknown',
      dev_selling_while_promoting: null,
      dev_sell_evidence: [],
      creator_wallet_empty: creatorWalletEmpty,
      lp_status: rugcheckSignals.lp_status || 'UNKNOWN',
      status: 'UNKNOWN',
      details: `${creatorDetails} No direct on-chain proof of creator selling was found in current data.`,
      red_flags: [],
      green_flags: creatorWalletEmpty === true ? ['Creator wallet is empty'] : [],
    },
    chart_lifecycle: {
      phase,
      phase_confidence: h1Buys + h1Sells > 10 ? 'MEDIUM' : 'LOW',
      trend_structure: trend,
      momentum_status: h1 > 8 && m5 > 0 ? 'ACCELERATING' : h24 > 60 && h1 < 0 ? 'EXHAUSTED' : 'COOLING',
      volume_confirmation: volumeConfirmation,
      setup_quality_score: recommendation === 'AVOID' ? 3 : trend === 'BULLISH' ? 7 : 5,
      ape_signal: apeSignal,
      invalidation:
        apeSignal === 'APE_NOW'
          ? 'If 1h trend turns red with heavy sells, stop and wait.'
          : apeSignal === 'WAIT_PULLBACK'
            ? 'Wait for a clean base and more buyer strength first.'
            : 'Do not chase. Wait for better structure and safer risk.',
      details: `Phase looks like ${phase}. Trend is ${trend.toLowerCase()}. Best action now is ${apeSignal === 'APE_NOW' ? 'ape small' : apeSignal === 'WAIT_PULLBACK' ? 'wait' : 'avoid for now'}.`,
    },
  }
}

export function useTokenData(initialTokenAddress = '') {
  const requestIdRef = useRef(0)
  const [selectedTokenAddress, setSelectedTokenAddress] = useState(initialTokenAddress)
  const [tokenData, setTokenData] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState(null)
  const [searchResults, setSearchResults] = useState([])
  const [llmPending, setLlmPending] = useState(false)

  const runSearch = useCallback(async (query) => {
    const q = (query || '').trim()
    if (!q) {
      setSearchResults([])
      return []
    }

    setSearchLoading(true)
    setSearchError(null)
    try {
      const results = await searchTokens(q)
      setSearchResults(results)
      return results
    } catch (err) {
      setSearchError(err.message || 'Token search failed')
      setSearchResults([])
      return []
    } finally {
      setSearchLoading(false)
    }
  }, [])

  const runXRay = useCallback(async (tokenAddress) => {
    const requestId = ++requestIdRef.current
    const ca = (tokenAddress || '').trim()
    if (!ca) {
      setTokenData(null)
      setAnalysis(null)
      setError(null)
      return null
    }

    if (typeof window !== 'undefined' && !xrayCacheHydrated) {
      hydrateXrayCacheFromStorage()
    }

    const now = Date.now()
    const cachedEntry = XRAY_MEMORY_CACHE.get(ca)
    if (cachedEntry && cachedEntry.fetchedAt && now - cachedEntry.fetchedAt <= XRAY_CACHE_TTL_MS) {
      console.log(`[useTokenData] Using cached X-Ray for: ${ca}`)
      setTokenData(cachedEntry.xrayPayload)
      setAnalysis(cachedEntry.analysis)
      setError(null)
      setLoading(false)
      setLlmPending(false)
      return { xrayPayload: cachedEntry.xrayPayload, llmAnalysis: cachedEntry.analysis }
    }

    setLoading(true)
    setLlmPending(true)
    setError(null)
    // Prevent stale cross-token UI while preserving a fast, non-blank experience.
    setTokenData(null)
    setAnalysis(
      emptyAnalysis(
        ca,
        'Loading live on-chain data...',
      ),
    )
    
    try {
      console.log(`[useTokenData] Fetching X-Ray for: ${ca}`)
      const xrayPayload = await fetchTokenXRay(ca)
      if (requestId !== requestIdRef.current) {
        console.log(`[useTokenData] Request ${requestId} superseded, aborting`)
        return null
      }

      console.log(`[useTokenData] X-Ray fetched successfully`, xrayPayload)
      setTokenData(xrayPayload)

      // Show deterministic fallback immediately so the dashboard doesn't feel stuck
      const quickFallback = fallbackAnalysisFromXray(xrayPayload)
      if (requestId === requestIdRef.current) {
        setError(null)
        setAnalysis(quickFallback)
        // Stop "Analyzing..." once deterministic data is ready; LLM can continue in background.
        setLoading(false)
      }

      try {
        console.log(`[useTokenData] Evaluating with LLM...`)
        const llmAnalysis = await evaluateTokenWithLLM(xrayPayload)
        if (requestId !== requestIdRef.current) {
          console.log(`[useTokenData] Request ${requestId} superseded during LLM, aborting`)
          return null
        }
        console.log(`[useTokenData] LLM analysis complete`)
        setError(null)
        setAnalysis(llmAnalysis)
        setLlmPending(false)
        XRAY_MEMORY_CACHE.set(ca, {
          xrayPayload,
          analysis: llmAnalysis,
          fetchedAt: Date.now(),
        })
        persistXrayCacheToStorage()
        return { xrayPayload, llmAnalysis }
      } catch (llmErr) {
        // Keep dashboard usable when AI fails; surface warning in fallback summary.
        console.warn(`[useTokenData] LLM evaluation failed:`, llmErr)
        if (requestId !== requestIdRef.current) {
          console.log(`[useTokenData] Request ${requestId} superseded during LLM fallback, aborting`)
          return null
        }
        setError(null)
        const fallback = fallbackAnalysisFromXray(xrayPayload)
        console.log(`[useTokenData] Using fallback analysis`)
        setAnalysis(fallback)
        setLlmPending(false)
        XRAY_MEMORY_CACHE.set(ca, {
          xrayPayload,
          analysis: fallback,
          fetchedAt: Date.now(),
        })
        persistXrayCacheToStorage()
        return { xrayPayload, llmAnalysis: null }
      }
    } catch (err) {
      // Extract clean error message without duplication
      let message = err.message || 'Token analysis failed'
      console.error(`[useTokenData] X-Ray fetch failed:`, err)
      
      // Remove any duplicate prefixes
      if (message.includes('Failed to analyze token:')) {
        message = message.replace(/^Failed to analyze token:\s*/i, '')
      }
      
      // Do not hard-fail UI for fresh/unindexed coins; show graceful fallback.
      // But set a user-visible error message
      const errorMsg = `Analysis failed: ${message}. This often happens on very new coins before indexers catch up. Try again in 30-90 seconds.`
      setError(errorMsg)
      setTokenData(null)
      setAnalysis(
        emptyAnalysis(
          ca,
          errorMsg,
        ),
      )
      setLlmPending(false)
      return { xrayPayload: null, llmAnalysis: null }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false)
        console.log(`[useTokenData] Loading complete for request ${requestId}`)
      }
    }
  }, [])

  useEffect(() => {
    setSelectedTokenAddress(initialTokenAddress || '')
  }, [initialTokenAddress])

  useEffect(() => {
    if (!selectedTokenAddress) {
      setTokenData(null)
      setAnalysis(null)
      setError(null)
      return
    }
    runXRay(selectedTokenAddress)
  }, [selectedTokenAddress, runXRay])

  const state = useMemo(
    () => ({
      tokenData,
      analysis,
      loading,
      error,
      llmPending,
      searchLoading,
      searchError,
      searchResults,
      setSelectedTokenAddress,
      runSearch,
      runXRay,
    }),
    [analysis, error, loading, llmPending, runSearch, runXRay, searchError, searchLoading, searchResults, tokenData],
  )

  return state
}
