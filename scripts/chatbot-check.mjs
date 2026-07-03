// 챗봇 일일 시나리오 체크 러너 (GitHub Actions에서 실행)
// 필요 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (선택: HUB_URL)
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { mkdir } from 'node:fs/promises'
import { judgeStep, buildFailureMail, normalizeStep } from './lib/judge.mjs'
import { sendMail } from '../server/smtp.js'

const HUB_URL = process.env.HUB_URL ?? 'https://mailer-sangjuns-projects-bbf3bb9f.vercel.app'
const STEP_TIMEOUT_MS = 60_000
// 1순위: 사내 챗봇 솔루션(cogi)의 입력창 id. 이후 일반 휴리스틱 순.
const INPUT_SELECTORS = ['#chat-input-text', 'textarea', 'input[type="text"]', 'input:not([type])', '[contenteditable="true"]']

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// 채팅 UI가 iframe 안에 있을 수 있으므로 모든 프레임을 순회하며 탐색.
// SPA 렌더링 지연 대비 15초 동안 0.5초 간격 재시도.
async function findInput(page, override) {
  const candidates = override ? [override, ...INPUT_SELECTORS] : INPUT_SELECTORS
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      for (const sel of candidates) {
        const loc = frame.locator(sel).first()
        if (await loc.isVisible().catch(() => false)) return { input: loc, frame }
      }
    }
    await page.waitForTimeout(500)
  }
  return null
}

// 클릭 대상(버튼/링크/퀵리플라이) 탐색 — 모든 프레임 순회, 15초 재시도.
// selector가 있으면 그것을 최우선, 없으면 보이는 텍스트로 탐색.
async function findClickable(page, text, selector) {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      const locators = selector
        ? [frame.locator(selector).first()]
        : [
            frame.getByRole('button', { name: text }).first(),
            frame.getByText(text, { exact: true }).first(),
            frame.getByText(text).first(),
          ]
      for (const loc of locators) {
        if (await loc.isVisible().catch(() => false)) return { target: loc, frame }
      }
    }
    await page.waitForTimeout(500)
  }
  return null
}

// 기대 키워드가 어느 프레임에든 노출되는지 폴링(교차 프레임 응답 대응).
// 예: 하나은행은 동의 팝업이 부모 프레임, 챗봇 응답은 채팅 iframe에 나온다.
async function waitForTextAnyFrame(page, expect, timeout) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      if (await frame.getByText(expect).first().isVisible().catch(() => false)) return true
    }
    await page.waitForTimeout(500)
  }
  return false
}

async function checkBot(browser, bot) {
  const started = Date.now()
  const page = await browser.newPage()
  try {
    // domcontentloaded로 대기(networkidle는 챗봇 위젯의 웹소켓·롱폴링·하트비트 때문에
    // 영원히 idle이 안 돼 화면이 정상이어도 timeout 남). 실제 요소 준비는 아래
    // findInput/findClickable의 15초 폴링이 담당한다.
    await page.goto(bot.url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      .catch(err => { throw new Error(`goto_failed: ${err.message.slice(0, 120)}`) })

    for (const [i, rawStep] of bot.scenario.entries()) {
      const step = normalizeStep(rawStep)

      if (step.type === 'click') {
        const found = await findClickable(page, step.text, step.selector)
        if (!found) throw new Error(`button_not_found: 스텝 ${i + 1}에서 ${step.selector ? `셀렉터 "${step.selector}"` : `"${step.text}" 버튼`}을 찾지 못함`)
        await found.target.click()
      } else {
        // 스텝별 셀렉터 > 봇 레벨 셀렉터(구버전 호환) > 기본 휴리스틱
        const found = await findInput(page, step.selector ?? bot.input_selector)
        if (!found) throw new Error(`input_not_found: 스텝 ${i + 1}에서 입력창을 찾지 못함`)
        await found.input.fill(step.text)
        await found.input.press('Enter')
      }

      // 응답 검사: 액션 프레임을 포함한 모든 프레임에서 기대 키워드 탐색
      // (동의 팝업=부모 프레임, 응답=채팅 iframe 등 교차 프레임 케이스 대응)
      const appeared = await waitForTextAnyFrame(page, step.expect, STEP_TIMEOUT_MS)
      if (!appeared) {
        // 실패 발췌는 모든 프레임 본문을 합쳐서 수집
        let pageText = ''
        for (const f of page.frames()) pageText += (await f.locator('body').innerText().catch(() => '')) + '\n'
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

// 부분 실행: 단건(BOT_ID) 또는 카테고리(CATEGORY). 둘 다 있으면 BOT_ID 우선.
const isSubset = Boolean(process.env.BOT_ID || process.env.CATEGORY)
let query = db.from('chatbots').select('*').eq('enabled', true)
if (process.env.BOT_ID) {
  query = query.eq('id', process.env.BOT_ID)
} else if (process.env.CATEGORY) {
  query = process.env.CATEGORY === '__none__'
    ? query.is('category', null)
    : query.eq('category', process.env.CATEGORY)
}
const { data: bots, error } = await query
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
if (isSubset) console.log('부분 실행(단건/카테고리) — 메일 알림 생략')
else await notifyFailures(failures)
console.log(`완료: 성공 ${targets.length - failures.length} / 실패 ${failures.length}`)
