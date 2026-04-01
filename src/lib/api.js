// src/lib/api.js
const BASE = import.meta.env.VITE_MAILER_URL
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

async function request(method, path = '', body = null, password) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ANON_KEY}`,
      'x-app-password': password ?? '',
    },
    body: body ? JSON.stringify(body) : null,
  })
  if (res.status === 401) throw new Error('UNAUTHORIZED')
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `HTTP ${res.status}`)
  }
  if (method === 'DELETE') return null
  return res.json()
}

export const getJobs = (pw) => request('GET', '', null, pw)
export const createJob = (job, pw) => request('POST', '', job, pw)
export const updateJob = (id, patch, pw) => request('PATCH', `?id=${id}`, patch, pw)
export const deleteJob = (id, pw) => request('DELETE', `?id=${id}`, null, pw)
export const reorderJobs = (ids, pw) =>
  Promise.all(ids.map((id, i) => request('PATCH', `?id=${id}`, { sort_order: i }, pw)))
