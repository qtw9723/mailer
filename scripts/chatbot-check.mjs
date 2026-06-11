// 챗봇 일일 시나리오 체크 러너 (GitHub Actions에서 실행)
// 필요 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (선택: HUB_URL)
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { mkdir } from 'node:fs/promises'
import { judgeStep, buildFailureMail } from './lib/judge.mjs'
import { sendMail } from '../server/smtp.js'

const HUB_URL = process.env.HUB_URL ?? 'https://mailer-sangjuns-projects-bbf3bb9f.vercel.app'
const STEP_TIMEOUT_MS = 60_000
const INPUT_SELECTORS = ['textarea', 'input[type="text"]', '[contenteditable="true"]']

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function findInput(page, override) {
  const candidates = override ? [override, ...INPUT_SELECTORS] : INPUT_SELECTORS
  for (const sel of candidates) {
    const loc = page.locator(sel).first()
    if (await loc.isVisible().catch(() => false)) return loc
  }
  return null
}

async function checkBot(browser, bot) {
  const started = Date.now()
  const page = await browser.newPage()
  try {
    await page.goto(bot.url, { waitUntil: 'networkidle', timeout: 30_000 })
      .catch(err => { throw new Error(`goto_failed: ${err.message.slice(0, 120)}`) })

    for (const [i, step] of bot.scenario.entries()) {
      const input = await findInput(page, bot.input_selector)
      if (!input) throw new Error(`input_not_found: 스텝 ${i + 1}에서 입력창을 찾지 못함`)
      await input.fill(step.say)
      await input.press('Enter')

      const appeared = await page
        .getByText(step.expect)
        .first()
        .waitFor({ state: 'visible', timeout: STEP_TIMEOUT_MS })
        .then(() => true)
        .catch(() => false)
      if (!appeared) {
        const pageText = await page.locator('body').innerText().catch(() => '')
        const verdict = judgeStep(pageText, step.expect)
        throw new Error(`timeout: 스텝 ${i + 1} ${verdict.reason}\n응답 발췌: ${verdict.excerpt ?? '(없음)'}`)
      }
    }
    return { ok: true, detail: null, duration_ms: Date.now() - started }
  } catch (err) {
    await mkdir('screenshots', { recursive: true })
    await page.screenshot({ path: `screenshots/${bot.name.replace(/[^\w가-힣-]/g, '_')}.png`, fullPage: true }).catch(() => {})
    return { ok: false, detail: String(err.message).slice(0, 500), duration_ms: Date.now() - started }
  } finally {
    await page.close()
  }
}

async function notifyFailures(failures) {
  if (!failures.length) return
  const { data: settings } = await db.from('chatbot_monitor_settings').select('recipients').eq('id', 1).single()
  const recipients = settings?.recipients ?? []
  if (!recipients.length) { console.log('수신자 미설정 — 메일 생략'); return }

  const { data: senders } = await db.from('sender_accounts').select('email, app_password').order('created_at').limit(1)
  if (!senders?.length) { console.log('발신 계정 없음 — 메일 생략'); return }

  const { subject, body } = buildFailureMail(failures, `${HUB_URL}/chatbot`)
  for (const to of recipients) {
    await sendMail({ senderEmail: senders[0].email, senderPassword: senders[0].app_password, to, subject, body })
      .catch(err => console.error(`메일 발송 실패(${to}):`, err.message))
  }
  console.log(`실패 알림 메일 발송: ${recipients.length}명`)
}

const { data: bots, error } = await db.from('chatbots').select('*').eq('enabled', true)
if (error) { console.error('봇 목록 조회 실패:', error.message); process.exit(1) }

const targets = (bots ?? []).filter(b => Array.isArray(b.scenario) && b.scenario.length > 0)
console.log(`체크 대상: ${targets.length}개 봇`)
if (!targets.length) process.exit(0)

const browser = await chromium.launch()
const failures = []
for (const bot of targets) {
  const result = await checkBot(browser, bot)
  console.log(`[${result.ok ? 'OK' : 'FAIL'}] ${bot.name} (${result.duration_ms}ms)${result.ok ? '' : ` — ${result.detail}`}`)
  const { error: logErr } = await db.from('chatbot_check_log')
    .insert({ chatbot_id: bot.id, ok: result.ok, detail: result.detail, duration_ms: result.duration_ms })
  if (logErr) console.error('로그 기록 실패:', logErr.message)
  if (!result.ok) failures.push({ name: bot.name, detail: result.detail })
}
await browser.close()
await notifyFailures(failures)
console.log(`완료: 성공 ${targets.length - failures.length} / 실패 ${failures.length}`)
