// src/lib/api/grafana.js
const BASE = import.meta.env.VITE_API_BASE_URL ?? ''

export async function getReport(password) {
  const res = await fetch(`${BASE}/api/grafana/report`, {
    headers: { 'x-app-password': password ?? '' },
  })
  if (res.status === 401) throw new Error('UNAUTHORIZED')
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `HTTP ${res.status}`)
  }
  return res.json()
}
