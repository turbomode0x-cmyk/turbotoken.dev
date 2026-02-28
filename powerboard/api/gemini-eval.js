import { ANALYZER_SYSTEM_PROMPT } from '../src/services/ai/prompts.js'
import { validateAndCoerceAnalysis } from '../src/services/ai/validation.js'
import { normalizeSecurityEvidence, enforceDeterministicRiskRules } from '../src/services/risk/enforcement.js'

const DEFAULT_MODELS = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-pro']
const LLM_TIMEOUT_MS = 30000

function getModels() {
  const raw = process.env.GEMINI_MODELS
  if (!raw) return DEFAULT_MODELS
  return raw
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)
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

  const direct = safeJsonParse(text)
  if (direct) return direct

  const fenced = text.replace(/```json|```/gi, '').trim()
  const fromFenced = safeJsonParse(fenced)
  if (fromFenced) return fromFenced

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

async function fetchWithTimeout(url, init = {}, timeoutMs = LLM_TIMEOUT_MS) {
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
    throw err
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Method Not Allowed' }))
    return
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Gemini API key is not configured on the server.' }))
    return
  }

  let body = ''
  for await (const chunk of req) {
    body += chunk
  }

  let xrayPayload
  try {
    const parsed = JSON.parse(body || '{}')
    xrayPayload = parsed.xrayPayload
  } catch {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Invalid JSON in request body.' }))
    return
  }

  if (!xrayPayload || typeof xrayPayload !== 'object') {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Missing or invalid xrayPayload in request body.' }))
    return
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

  const models = getModels()
  let lastError = null

  try {
    for (const model of models) {
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
          const finalAnalysis = enforceDeterministicRiskRules(withEvidence, xrayPayload)

          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(finalAnalysis))
          return
        } catch (err) {
          lastError = err
          const msg = String(err?.message || '')

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

          const modelUnavailable = msg.includes('(404)')
          if (modelUnavailable) {
            break
          }

          if (msg.includes('(401)') || msg.includes('(403)')) {
            throw new Error('AI analysis authentication failed. Please check your API key configuration.')
          }
        }
      }
    }

    const finalMessage = String(lastError?.message || 'Unknown AI error')
    let clientMessage = 'AI analysis failed. Please try again.'
    if (finalMessage.includes('timed out')) {
      clientMessage = `AI analysis timed out after ${LLM_TIMEOUT_MS / 1000}s. Please try again.`
    } else if (finalMessage.includes('(429)')) {
      clientMessage = 'AI is rate-limited right now. Please wait a few seconds and try again.'
    }

    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: clientMessage }))
  } catch (err) {
    console.error('[api/gemini-eval] Fatal error:', err)
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'AI analysis failed on the server. Please try again later.' }))
  }
}

