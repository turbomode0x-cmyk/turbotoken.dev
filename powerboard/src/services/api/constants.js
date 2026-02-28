// API URLs
export const DEXSCREENER_SEARCH_URL = 'https://api.dexscreener.com/latest/dex/search'
export const DEXSCREENER_TOKEN_URL = 'https://api.dexscreener.com/latest/dex/tokens'
export const RUGCHECK_URL = 'https://api.rugcheck.xyz/v1/tokens'
export const BUBBLEMAPS_URL = 'https://api-legacy.bubblemaps.io/map-data'

// Timeout constants (milliseconds)
export const API_TIMEOUT = 15000 // 15 seconds for external APIs
export const LLM_TIMEOUT = 30000 // 30 seconds for LLM evaluation

// Gemini models configuration
export const GEMINI_MODELS = (
  import.meta.env.VITE_GEMINI_MODELS ||
  'gemini-2.0-flash,gemini-2.5-flash,gemini-2.5-pro'
)
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean)
