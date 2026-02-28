import { API_TIMEOUT } from './constants.js'

export async function fetchWithTimeout(url, init = {}, timeoutMs = API_TIMEOUT) {
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

export async function fetchJson(url, init = {}) {
  return fetchWithTimeout(url, init, API_TIMEOUT)
}

export async function fetchJsonOrNull(url, init = {}) {
  try {
    return await fetchJson(url, init)
  } catch (err) {
    console.warn(`Failed to fetch ${url}:`, err.message)
    return null
  }
}
