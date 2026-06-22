// src/lib/api/chatbot.js
const BASE = import.meta.env.VITE_API_BASE_URL ?? ''

async function request(method, path, body = null, password) {
  const res = await fetch(`${BASE}/api/chatbot${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
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

export const getBots = (pw) => request('GET', '/bots', null, pw)
export const createBot = (bot, pw) => request('POST', '/bots', bot, pw)
export const updateBot = (id, patch, pw) => request('PATCH', `/bots/${id}`, patch, pw)
export const deleteBot = (id, pw) => request('DELETE', `/bots/${id}`, null, pw)
export const getChatbotSettings = (pw) => request('GET', '/settings', null, pw)
export const updateChatbotSettings = (body, pw) => request('PUT', '/settings', body, pw)
export const renameCategory = (from, to, pw) => request('PATCH', '/categories', { from, to }, pw)
export const deleteCategory = (name, pw) => request('DELETE', '/categories', { name }, pw)
// target: { botId } 단건 / { category } 그룹 / 없으면 전체
export const runCheck = (target, pw) => {
  const body = target?.botId ? { bot_id: target.botId } : target?.category ? { category: target.category } : {}
  return request('POST', '/run-check', body, pw)
}
