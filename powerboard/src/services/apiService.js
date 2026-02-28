// Re-export public API from refactored modules
import { DEXSCREENER_SEARCH_URL, DEXSCREENER_TOKEN_URL, RUGCHECK_URL, BUBBLEMAPS_URL } from './api/constants.js'
import { fetchJson, fetchJsonOrNull } from './api/fetcher.js'
import { normalizeDexPair, uniqueByAddress, normalizeRugcheckSignals, normalizeBubblemapsSignals } from './api/normalizers.js'
import { evaluateTokenWithLLM } from './ai/evaluator.js'
import { computeDeterministicRiskScore } from './risk/scoring.js'

// Public API: Token search
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

// Public API: Fetch token X-Ray data
export async function fetchTokenXRay(tokenAddress) {
  const ca = (tokenAddress || '').trim()
  if (!ca) {
    throw new Error('Token address is required')
  }

  try {
    // Concurrent fetches for X-ray data
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

// Re-export public API functions
export { evaluateTokenWithLLM } from './ai/evaluator.js'
export { computeDeterministicRiskScore } from './risk/scoring.js'
