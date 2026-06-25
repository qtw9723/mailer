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

export async function getSettings(password) {
  const res = await fetch(`${BASE}/api/grafana/settings`, {
    headers: { 'x-app-password': password ?? '' },
  })
  if (res.status === 401) throw new Error('UNAUTHORIZED')
  if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`)
  return res.json()
}

export async function updateSettings(body, password) {
  const res = await fetch(`${BASE}/api/grafana/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-app-password': password ?? '' },
    body: JSON.stringify(body),
  })
  if (res.status === 401) throw new Error('UNAUTHORIZED')
  if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`)
  return res.json()
}

export async function testQuery(body, password) {
  const res = await fetch(`${BASE}/api/grafana/test-query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-app-password': password ?? '' },
    body: JSON.stringify(body),
  })
  if (res.status === 401) throw new Error('UNAUTHORIZED')
  if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`)
  return res.json()
}

async function req(method, path, password, body = null) {
  const res = await fetch(`${BASE}/api/grafana${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-app-password': password ?? '' },
    body: body ? JSON.stringify(body) : null,
  })
  if (res.status === 401) throw new Error('UNAUTHORIZED')
  if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`)
  return method === 'DELETE' ? null : res.json()
}

// 현재 로그 LLM 분석(미리보기, 저장 안 함)
export const analyzeNow = (password) => req('POST', '/analyze', password, {})
export const getLogTypes = (password) => req('GET', '/log-types', password)
export const getLogType = (id, password) => req('GET', `/log-types/${id}`, password)
export const updateLogType = (id, body, password) => req('PATCH', `/log-types/${id}`, password, body)
export const deleteLogType = (id, password) => req('DELETE', `/log-types/${id}`, password)
export const updateLogTypeRun = (runId, note, password) => req('PATCH', `/log-type-runs/${runId}`, password, { note })
