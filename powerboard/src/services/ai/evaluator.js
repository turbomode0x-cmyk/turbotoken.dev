import { fetchWithTimeout } from '../api/fetcher.js'
import { GEMINI_MODELS, LLM_TIMEOUT } from '../api/constants.js'
import { ANALYZER_SYSTEM_PROMPT } from './prompts.js'
import { validateAndCoerceAnalysis } from './validation.js'
import { normalizeSecurityEvidence } from '../risk/enforcement.js'
import { enforceDeterministicRiskRules } from '../risk/enforcement.js'

function safeJsonParse(value) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export function extractJsonObject(rawText) {
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

export function deepSimplifyStrings(value) {
  if (Array.isArray(value)) return value.map(deepSimplifyStrings)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, deepSimplifyStrings(item)]),
    )
  }
  return simplifyText(value)
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
