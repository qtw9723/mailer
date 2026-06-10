# CS SmartHub NOC 관제 콘솔 리디자인 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CS SmartHub를 다크 무채색 기조의 관제 콘솔로 리디자인 — 토큰 기반 CSS, 아이콘 레일, 컴팩트 행 리스트, 하트비트 바(send_log), 공통 UX 개선(토스트·확인 다이얼로그·접근성·반응형).

**Architecture:** Tailwind v4 `@theme`으로 시맨틱 토큰을 정의하고 기존 plain CSS 클래스 체계를 유지하며 토큰으로 치환. 공용 컴포넌트(Modal, ConfirmDialog, IconRail, CommandPalette, HeartbeatBar)를 `src/components/shared/`에 신설하고 App.jsx에 AppLayout 도입. 백엔드는 send_log 테이블 1개 + tick 기록 + GET /jobs 병합만 변경.

**Tech Stack:** React 19, Vite, Tailwind v4(@theme 토큰), sonner(토스트), cmdk(커맨드 팔레트), dnd-kit(기존), vitest + supertest + testing-library.

**스펙:** `docs/superpowers/specs/2026-06-10-noc-redesign-design.md`

**전역 규칙:**
- 마이그레이션은 `supabase db push` 금지. SQL Editor로 멱등 적용(Task 5 참고).
- 모든 색은 토큰(`var(--color-*)`)만 사용, 하드코딩 hex 금지.
- 각 Task 끝에 커밋. 테스트는 `npm test`(vitest run).

---

### Task 1: Pretendard + 디자인 토큰 + 전역 베이스

**Files:**
- Modify: `index.html`
- Modify: `src/index.css` (1~12행 베이스 + 토큰 블록 추가 + 기존 색 일괄 치환)

- [ ] **Step 1: index.html에 Pretendard 다이나믹 서브셋 추가**

`<head>` 안 기존 favicon link 아래에:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
```

- [ ] **Step 2: index.css 상단을 토큰 + 베이스로 교체**

기존 1~12행(`@import "tailwindcss";` ~ body 블록)을 다음으로 교체:

```css
/* src/index.css */
@import "tailwindcss";

@theme {
  --color-bg-base: #101014;
  --color-bg-surface: #16161c;
  --color-bg-raised: #1d1d25;
  --color-bg-hover: #222230;
  --color-border-subtle: rgba(255, 255, 255, 0.07);
  --color-border-strong: rgba(255, 255, 255, 0.14);
  --color-text-primary: #E8E8EE;
  --color-text-secondary: #8E8E9E;
  --color-text-faint: #55555f;
  --color-accent: #9d8ffc;
  --color-accent-hover: #b0a4fd;
  --color-status-ok: #4ade80;
  --color-status-error: #f87171;
  --color-status-warn: #fbbf24;
  --color-status-idle: #71717a;
  --color-status-info: #60a5fa;
  --font-sans: "Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif;
  --font-mono: ui-monospace, "SF Mono", Menlo, monospace;
}

*, *::before, *::after { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--color-bg-base);
  color: var(--color-text-primary);
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 1.5;
  letter-spacing: -0.01em;
  word-break: keep-all;
  overflow-wrap: break-word;
  min-height: 100vh;
}

:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.mono {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0;
}
```

- [ ] **Step 3: 기존 클래스의 색을 토큰으로 일괄 치환**

index.css 나머지 부분에서 아래 매핑대로 전부 치환(Edit replace_all 활용):

| 기존 | 치환 |
|---|---|
| `#0d0d14` | `var(--color-bg-base)` |
| `#13131f` | `var(--color-bg-raised)` |
| `#9d8ffc` (포커스·CTA·액센트) | `var(--color-accent)` |
| `#b0a4fd` | `var(--color-accent-hover)` |
| `rgb(248,113,113)`, `#f87171`, `#ff8a80` | `var(--color-status-error)` |
| `#81c784`, `rgba(46,125,50,*)` 텍스트 | `var(--color-status-ok)` |
| `#e2e2e2`, `#e8e8f0`, `#f0f0f0`, `#e0e0f0`, `#ECECF1` | `var(--color-text-primary)` |
| `#a0a0b0`, `#8080a0`, `#808090`, `#9090a0`, `#b8b8c8`, `#c0c0d0`, `#c8c8d8` | `var(--color-text-secondary)` |
| `#404050`, `#505060`, `#606070`, `#707080`, `#7070a0` | `var(--color-text-faint)` |
| `rgba(157,143,252,0.1)`~`0.2` 배경류 | `color-mix(in srgb, var(--color-accent) 12%, transparent)` |
| `rgba(157,143,252,0.12)`~`0.3` 보더류 | `var(--color-border-subtle)` (카드) / `var(--color-border-strong)` (강조) |
| `rgba(255,255,255,0.02~0.04)` 표면 | `var(--color-bg-surface)` |
| `rgba(255,255,255,0.05~0.08)` 보더/호버 | `var(--color-border-subtle)` / `var(--color-bg-hover)` |

추가 정리(같은 단계에서):
- `.form-label`, `.app-title`에서 `text-transform: uppercase`와 `letter-spacing` 제거. `.form-label`은 `font-size: 13px; font-weight: 500; color: var(--color-text-secondary);`로.
- `.app-header` 중복 정의(81행 vs 568행) 하나로 병합: `padding: 0 24px; height: 48px;` 유지 항목은 첫 정의의 flex 속성.
- `.form-hint { font-size: 12px; color: var(--color-text-secondary); margin: 6px 0 0; }` 신설.
- `.grafana-summary.ok/.alert`, `.grafana-card.ok/.warn/.na`, `.grafana-log-head.*`의 색을 상태 토큰 + `color-mix` fill로 치환.
- `.job-empty` 색을 `var(--color-text-secondary)`로 상향(기존 #404050는 AA 미달).

- [ ] **Step 4: 검증 — dev 서버 기동 + 기존 테스트**

Run: `npm test` → 기존 5개 테스트 파일 전부 PASS 기대.
Run: `npm run build` → 에러 없이 빌드 기대.

- [ ] **Step 5: 커밋**

```bash
git add index.html src/index.css
git commit -m "feat(design): 디자인 토큰(@theme) + Pretendard + 전역 베이스 도입"
```

---

### Task 2: 다음 발송 계산 헬퍼 (TDD)

**Files:**
- Modify: `src/lib/datetime.js`
- Test: `src/lib/datetime.test.js` (기존 파일에 추가)

- [ ] **Step 1: 실패하는 테스트 작성** — `datetime.test.js`에 추가:

```js
import { nextSendAt, formatNextSend } from './datetime.js'

describe('nextSendAt', () => {
  it('미발송 작업은 null (곧 발송 의미)', () => {
    expect(nextSendAt(null, 60)).toBeNull()
  })
  it('마지막 발송 + 간격으로 다음 발송 시각 계산', () => {
    const next = nextSendAt('2026-06-10T00:00:00.000Z', 120)
    expect(next.toISOString()).toBe('2026-06-10T02:00:00.000Z')
  })
})

describe('formatNextSend', () => {
  const now = new Date('2026-06-10T03:00:00.000Z') // KST 12:00
  it('null이면 곧 발송', () => {
    expect(formatNextSend(null, now)).toBe('곧 발송')
  })
  it('과거 시각이면 곧 발송', () => {
    expect(formatNextSend(new Date('2026-06-10T02:59:00.000Z'), now)).toBe('곧 발송')
  })
  it('1시간 이내는 N분 후', () => {
    expect(formatNextSend(new Date('2026-06-10T03:37:00.000Z'), now)).toBe('37분 후')
  })
  it('당일+1시간 이후는 절대시각·상대 병기', () => {
    const s = formatNextSend(new Date('2026-06-12T00:00:00.000Z'), now) // KST 6/12 09:00
    expect(s).toBe('6월 12일 (금) 09:00 · 2일 후')
  })
  it('24시간 이내는 시간 단위 상대표기', () => {
    const s = formatNextSend(new Date('2026-06-10T08:00:00.000Z'), now) // KST 17:00
    expect(s).toBe('6월 10일 (수) 17:00 · 5시간 후')
  })
})
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run src/lib/datetime.test.js` → FAIL ("nextSendAt is not a function") 기대.

- [ ] **Step 3: 구현** — `datetime.js`에 추가 (기존 `fmtKst` 패턴과 같은 파일):

```js
export function nextSendAt(lastSentAt, intervalMinutes) {
  if (!lastSentAt) return null
  return new Date(new Date(lastSentAt).getTime() + intervalMinutes * 60_000)
}

const KST = 'Asia/Seoul'

export function formatNextSend(next, now = new Date()) {
  if (!next) return '곧 발송'
  const diffMs = next.getTime() - now.getTime()
  if (diffMs <= 0) return '곧 발송'
  const diffMin = Math.round(diffMs / 60_000)
  if (diffMin < 60) return `${diffMin}분 후`

  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: KST, month: 'numeric', day: 'numeric', weekday: 'short',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(next)
  const get = t => parts.find(p => p.type === t)?.value
  const abs = `${get('month')}월 ${get('day')}일 (${get('weekday')}) ${get('hour')}:${get('minute')}`

  const rel = diffMin < 24 * 60
    ? `${Math.round(diffMin / 60)}시간 후`
    : `${Math.round(diffMin / (24 * 60))}일 후`
  return `${abs} · ${rel}`
}
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run src/lib/datetime.test.js` → PASS. (Intl 출력 형식이 환경별 미세 차이 가능 — 실패 시 기대 문자열을 실제 출력으로 보정하되 구조는 유지)

- [ ] **Step 5: 커밋** — `git add src/lib/datetime.* && git commit -m "feat(mailer): 다음 발송 시각 계산·표기 헬퍼 추가"`

---

### Task 3: sonner·cmdk 설치 + Modal·ConfirmDialog (TDD)

**Files:**
- Create: `src/components/shared/Modal.jsx`
- Create: `src/components/shared/ConfirmDialog.jsx`
- Test: `src/components/shared/ConfirmDialog.test.jsx`
- Modify: `package.json` (deps)

- [ ] **Step 1: 의존성 설치** — Run: `npm install sonner cmdk`

- [ ] **Step 2: 실패하는 테스트 작성** — `ConfirmDialog.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ConfirmDialog from './ConfirmDialog.jsx'

describe('ConfirmDialog', () => {
  it('제목·메시지·버튼 렌더, dialog 시맨틱', () => {
    render(<ConfirmDialog title="작업 삭제" message={'"주간 리포트" 작업을 삭제할까요?'} confirmLabel="삭제" danger onConfirm={() => {}} onCancel={() => {}} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('작업 삭제')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument()
  })
  it('확인 클릭 시 onConfirm', () => {
    const onConfirm = vi.fn()
    render(<ConfirmDialog title="t" message="m" confirmLabel="확인" onConfirm={onConfirm} onCancel={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '확인' }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })
  it('ESC 시 onCancel', () => {
    const onCancel = vi.fn()
    render(<ConfirmDialog title="t" message="m" onConfirm={() => {}} onCancel={onCancel} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 3: 실패 확인** — Run: `npx vitest run src/components/shared/ConfirmDialog.test.jsx` → FAIL (모듈 없음).

- [ ] **Step 4: Modal.jsx 구현** (공용 오버레이+다이얼로그 시맨틱 — JobModal·SenderModal·ConfirmDialog가 공유):

```jsx
import { useEffect, useRef } from 'react'

export default function Modal({ title, onClose, children, maxWidth = 500 }) {
  const ref = useRef(null)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    ref.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} style={{ maxWidth }}>
        {title && <h2 className="modal-title">{title}</h2>}
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: ConfirmDialog.jsx 구현**:

```jsx
import Modal from './Modal.jsx'

export default function ConfirmDialog({ title, message, confirmLabel = '확인', danger = false, onConfirm, onCancel }) {
  return (
    <Modal title={title} onClose={onCancel} maxWidth={400}>
      <p className="confirm-message">{message}</p>
      <div className="modal-actions">
        <button type="button" className="modal-cancel" onClick={onCancel}>취소</button>
        <button type="button" className={danger ? 'modal-submit modal-submit-danger' : 'modal-submit'} onClick={onConfirm} autoFocus>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
```

- [ ] **Step 6: CSS 추가** — index.css 모달 섹션에:

```css
.confirm-message { font-size: 14px; color: var(--color-text-primary); margin: 0 0 4px; line-height: 1.6; }
.modal-submit-danger { background: var(--color-status-error); color: #1a0d0d; }
.modal-submit-danger:hover { background: color-mix(in srgb, var(--color-status-error) 85%, white); }
```

- [ ] **Step 7: 통과 확인** — Run: `npx vitest run src/components/shared/ConfirmDialog.test.jsx` → PASS

- [ ] **Step 8: 커밋** — `git add -A && git commit -m "feat(shared): Modal·ConfirmDialog 공용 컴포넌트 + sonner/cmdk 의존성"`

---

### Task 4: AppLayout(아이콘 레일 + Cmd+K + Toaster) + 라우팅 개편

**Files:**
- Create: `src/components/shared/IconRail.jsx`
- Create: `src/components/shared/CommandPalette.jsx`
- Create: `src/components/shared/AppLayout.jsx`
- Modify: `src/App.jsx`, `src/components/shared/AppHeader.jsx`
- Modify: `src/index.css` (레일·팔레트·헤더 CSS)

- [ ] **Step 1: IconRail.jsx**

```jsx
import { useNavigate, useLocation } from 'react-router-dom'
import { Mail, BarChart3, Bot, LogOut, Hexagon } from 'lucide-react'
import { clearCookie } from '../../lib/auth.js'

const TOOLS = [
  { path: '/mailer', icon: Mail, label: 'Mailer' },
  { path: '/grafana', icon: BarChart3, label: 'Grafana 리포트' },
  { path: '/chatbot', icon: Bot, label: '챗봇 모니터링 (준비 중)', disabled: true },
]

export default function IconRail() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const handleLogout = () => { clearCookie(); navigate('/login') }

  return (
    <nav className="icon-rail" aria-label="도구 탐색">
      <button className="rail-logo" onClick={() => navigate('/')} aria-label="허브 홈" title="CS SmartHub">
        <Hexagon size={20} />
      </button>
      <div className="rail-tools">
        {TOOLS.map(({ path, icon: Icon, label, disabled }) => (
          <button
            key={path}
            className={`rail-item${pathname === path ? ' active' : ''}${disabled ? ' disabled' : ''}`}
            onClick={() => !disabled && navigate(path)}
            aria-label={label}
            title={label}
            aria-current={pathname === path ? 'page' : undefined}
            disabled={disabled}
          >
            <Icon size={18} />
          </button>
        ))}
      </div>
      <button className="rail-item rail-logout" onClick={handleLogout} aria-label="로그아웃" title="로그아웃">
        <LogOut size={17} />
      </button>
    </nav>
  )
}
```

- [ ] **Step 2: CommandPalette.jsx** (cmdk)

```jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Command } from 'cmdk'
import { Mail, BarChart3, Home, LogOut, Plus, Users, RefreshCw } from 'lucide-react'
import { clearCookie } from '../../lib/auth.js'

export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(o => !o)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const run = (fn) => { setOpen(false); fn() }

  return (
    <Command.Dialog open={open} onOpenChange={setOpen} label="명령 팔레트" className="cmdk">
      <Command.Input placeholder="명령 검색…" />
      <Command.List>
        <Command.Empty>결과 없음</Command.Empty>
        <Command.Group heading="이동">
          <Command.Item onSelect={() => run(() => navigate('/'))}><Home size={14} /> 허브 홈</Command.Item>
          <Command.Item onSelect={() => run(() => navigate('/mailer'))}><Mail size={14} /> Mailer로 이동</Command.Item>
          <Command.Item onSelect={() => run(() => navigate('/grafana'))}><BarChart3 size={14} /> Grafana 리포트로 이동</Command.Item>
        </Command.Group>
        <Command.Group heading="작업">
          <Command.Item onSelect={() => run(() => navigate('/mailer?new=1'))}><Plus size={14} /> 새 작업 만들기</Command.Item>
          <Command.Item onSelect={() => run(() => navigate('/mailer?tab=senders'))}><Users size={14} /> 발신 계정 관리</Command.Item>
          <Command.Item onSelect={() => run(() => navigate('/grafana'))}><RefreshCw size={14} /> 리포트 새로고침</Command.Item>
        </Command.Group>
        <Command.Group heading="계정">
          <Command.Item onSelect={() => run(() => { clearCookie(); navigate('/login') })}><LogOut size={14} /> 로그아웃</Command.Item>
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  )
}
```

(MailerPage가 Task 6에서 `?new=1`·`?tab=senders` 쿼리를 해석한다.)

- [ ] **Step 3: AppLayout.jsx + App.jsx 개편**

```jsx
// src/components/shared/AppLayout.jsx
import { Outlet } from 'react-router-dom'
import { Toaster } from 'sonner'
import IconRail from './IconRail.jsx'
import CommandPalette from './CommandPalette.jsx'

export default function AppLayout() {
  return (
    <div className="layout">
      <IconRail />
      <div className="layout-main">
        <Outlet />
      </div>
      <CommandPalette />
      <Toaster theme="dark" position="bottom-right" richColors />
    </div>
  )
}
```

App.jsx — 보호 라우트들을 AppLayout 하위로:

```jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage.jsx'
import HubPage from './pages/HubPage.jsx'
import MailerPage from './pages/MailerPage.jsx'
import GrafanaPage from './pages/GrafanaPage.jsx'
import ChatbotPage from './pages/ChatbotPage.jsx'
import ProtectedRoute from './components/shared/ProtectedRoute.jsx'
import AppLayout from './components/shared/AppLayout.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route path="/" element={<HubPage />} />
          <Route path="/mailer" element={<MailerPage />} />
          <Route path="/grafana" element={<GrafanaPage />} />
          <Route path="/chatbot" element={<ChatbotPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
```

(ProtectedRoute가 children을 그대로 렌더하므로 그대로 작동. 확인 후 필요 시 `<Outlet/>` 지원 추가.)

- [ ] **Step 4: AppHeader 간소화** — 뒤로가기·로그아웃 제거(레일로 이전), 툴 이름 + children(페이지 액션)만:

```jsx
export default function AppHeader({ toolName, children }) {
  return (
    <header className="app-header">
      <span className="app-title">{toolName}</span>
      <div className="header-actions">{children}</div>
    </header>
  )
}
```

HubPage의 자체 헤더(`hub-header`)에서도 로그아웃 버튼 제거(레일 담당).

- [ ] **Step 5: CSS 추가** — index.css에 레일·레이아웃·팔레트 섹션 신설:

```css
/* ── 레이아웃 + 아이콘 레일 ── */
.layout { display: flex; min-height: 100vh; }
.layout-main { flex: 1; min-width: 0; }
.icon-rail {
  width: 52px; flex-shrink: 0;
  display: flex; flex-direction: column; align-items: center;
  padding: 12px 0; gap: 4px;
  background: var(--color-bg-surface);
  border-right: 1px solid var(--color-border-subtle);
  position: sticky; top: 0; height: 100vh;
}
.rail-logo {
  background: none; border: none; cursor: pointer;
  color: var(--color-accent); padding: 8px; margin-bottom: 12px;
  display: flex; border-radius: 8px;
}
.rail-tools { display: flex; flex-direction: column; gap: 4px; flex: 1; }
.rail-item {
  position: relative; display: flex; align-items: center; justify-content: center;
  width: 38px; height: 38px; border-radius: 9px;
  background: none; border: none; cursor: pointer;
  color: var(--color-text-secondary);
  transition: color 150ms, background 150ms;
}
.rail-item:hover:not(.disabled) { color: var(--color-text-primary); background: var(--color-bg-hover); }
.rail-item.active { color: var(--color-accent); background: color-mix(in srgb, var(--color-accent) 12%, transparent); }
.rail-item.active::before {
  content: ''; position: absolute; left: -7px; width: 2px; height: 18px;
  border-radius: 2px; background: var(--color-accent);
}
.rail-item.disabled { opacity: 0.35; cursor: not-allowed; }
.rail-logout { margin-top: auto; }

.app-title { font-size: 15px; font-weight: 700; color: var(--color-text-primary); }
.header-actions { display: flex; align-items: center; gap: 12px; }

/* ── 커맨드 팔레트 ── */
.cmdk {
  position: fixed; top: 20vh; left: 50%; transform: translateX(-50%);
  width: 90%; max-width: 480px; z-index: 100;
  background: var(--color-bg-raised);
  border: 1px solid var(--color-border-strong);
  border-radius: 12px; overflow: hidden;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
}
.cmdk [cmdk-input] {
  width: 100%; padding: 14px 16px; font-size: 14px;
  background: transparent; border: none; outline: none;
  color: var(--color-text-primary); font-family: inherit;
  border-bottom: 1px solid var(--color-border-subtle);
}
.cmdk [cmdk-list] { max-height: 320px; overflow-y: auto; padding: 6px; }
.cmdk [cmdk-group-heading] {
  font-size: 11px; color: var(--color-text-faint); padding: 8px 10px 4px;
}
.cmdk [cmdk-item] {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 10px; border-radius: 8px; font-size: 13px;
  color: var(--color-text-primary); cursor: pointer;
}
.cmdk [cmdk-item][data-selected="true"] { background: var(--color-bg-hover); }
.cmdk [cmdk-empty] { padding: 16px; font-size: 13px; color: var(--color-text-secondary); text-align: center; }
```

`Command.Dialog`는 기본적으로 포털+오버레이 없이 렌더되므로 위 fixed 포지셔닝으로 처리.

- [ ] **Step 6: 검증** — `npm test` PASS + `npm run dev` 후 브라우저에서 레일 표시·툴 전환·Cmd+K 동작 확인 (curl로 `http://localhost:5173` 200 확인 + 수동 안내).

- [ ] **Step 7: 커밋** — `git commit -am "feat(layout): 아이콘 레일 + Cmd+K 팔레트 + AppLayout 도입"`

---

### Task 5: send_log 백엔드 (TDD)

**Files:**
- Create: `supabase/migrations/20260610000000_add_send_log.sql`
- Modify: `server/routes/mailer.js` (tick 기록 + GET /jobs 병합)
- Test: `server/routes/mailer.test.js` (추가)

- [ ] **Step 1: 마이그레이션 파일 작성** (기록용 커밋 — 적용은 SQL Editor):

```sql
-- send_log: 작업별 발송 성공/실패 이력 (하트비트 바)
CREATE TABLE IF NOT EXISTS send_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES mail_jobs(id) ON DELETE CASCADE,
  ok BOOLEAN NOT NULL,
  error TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_send_log_job_sent ON send_log (job_id, sent_at DESC);
```

- [ ] **Step 2: 실패하는 테스트 작성** — mailer.test.js의 `mockQuery` 헬퍼에 `in: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis()` 추가 후, 테스트 추가:

```js
describe('GET /api/mailer/jobs — recent_sends 병합', () => {
  it('각 작업에 최근 발송 이력(recent_sends)을 오래된순으로 포함', async () => {
    mockFrom.mockReturnValueOnce(mockQuery({ data: [{ id: 'j1', name: 'a' }, { id: 'j2', name: 'b' }], error: null }))
    mockFrom.mockReturnValueOnce(mockQuery({
      data: [
        { job_id: 'j1', ok: false, sent_at: '2026-06-10T02:00:00Z' },
        { job_id: 'j1', ok: true, sent_at: '2026-06-10T01:00:00Z' },
      ],
      error: null,
    }))
    const res = await request(app).get('/api/mailer/jobs').set(AUTH)
    expect(res.status).toBe(200)
    expect(res.body[0].recent_sends).toEqual([
      { ok: true, sent_at: '2026-06-10T01:00:00Z' },
      { ok: false, sent_at: '2026-06-10T02:00:00Z' },
    ])
    expect(res.body[1].recent_sends).toEqual([])
  })

  it('send_log 조회 실패 시에도 jobs는 정상 반환 (best-effort)', async () => {
    mockFrom.mockReturnValueOnce(mockQuery({ data: [{ id: 'j1' }], error: null }))
    mockFrom.mockReturnValueOnce(mockQuery({ data: null, error: { message: 'relation "send_log" does not exist' } }))
    const res = await request(app).get('/api/mailer/jobs').set(AUTH)
    expect(res.status).toBe(200)
    expect(res.body[0].recent_sends).toEqual([])
  })
})

describe('POST /api/mailer/tick — send_log 기록', () => {
  it('발송 성공 시 ok=true 기록', async () => {
    const job = { id: 'j1', is_active: true, last_sent_at: null, send_count: 0, use_index: false, subject: 's', body: 'b', recipients: ['a@b.c'], interval_minutes: 60, sender: 'gmail', sender_account_id: null, attachments: [] }
    const inserted = []
    mockFrom.mockImplementation((table) => {
      if (table === 'send_log') {
        return { insert: vi.fn((row) => { inserted.push(row); return Promise.resolve({ error: null }) }) }
      }
      return mockQuery({ data: [job], error: null })
    })
    const res = await request(app).post('/api/mailer/tick')
    expect(res.status).toBe(200)
    expect(inserted).toEqual([{ job_id: 'j1', ok: true, error: null }])
  })

  it('발송 실패 시 ok=false + 에러 메시지 기록', async () => {
    const { sendMail } = await import('../smtp.js')
    sendMail.mockRejectedValueOnce(new Error('SMTP down'))
    const job = { id: 'j1', is_active: true, last_sent_at: null, send_count: 0, use_index: false, subject: 's', body: 'b', recipients: ['a@b.c'], interval_minutes: 60, sender: 'gmail', sender_account_id: null, attachments: [] }
    const inserted = []
    mockFrom.mockImplementation((table) => {
      if (table === 'send_log') {
        return { insert: vi.fn((row) => { inserted.push(row); return Promise.resolve({ error: null }) }) }
      }
      return mockQuery({ data: [job], error: null })
    })
    const res = await request(app).post('/api/mailer/tick')
    expect(res.status).toBe(200)
    expect(res.body.failed).toBe(1)
    expect(inserted[0].ok).toBe(false)
    expect(inserted[0].error).toContain('SMTP down')
  })
})
```

- [ ] **Step 3: 실패 확인** — Run: `npx vitest run server/routes/mailer.test.js` → 신규 테스트 FAIL.

- [ ] **Step 4: 서버 구현** — `server/routes/mailer.js`:

GET /jobs 교체:

```js
router.get('/jobs', auth, async (_req, res) => {
  try {
    const { data, error } = await db
      .from('mail_jobs')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })
    if (error) throw error

    // 하트비트용 최근 발송 이력 병합 (best-effort — send_log 미존재 시에도 동작)
    const byJob = new Map(data.map(j => [j.id, []]))
    if (data.length) {
      const { data: logs } = await db
        .from('send_log')
        .select('job_id, ok, sent_at')
        .in('job_id', data.map(j => j.id))
        .order('sent_at', { ascending: false })
        .limit(Math.min(data.length * 10, 300))
      for (const row of logs ?? []) {
        const list = byJob.get(row.job_id)
        if (list && list.length < 10) list.push({ ok: row.ok, sent_at: row.sent_at })
      }
    }
    res.json(data.map(j => ({ ...j, recent_sends: byJob.get(j.id).reverse() })))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})
```

tick 내 due.map 콜백 끝부분(last_sent_at 업데이트 이후)과 catch에 기록 추가 — 콜백을 try/catch로 감싼다:

```js
const results = await Promise.allSettled(
  due.map(async (job) => {
    const logSend = async (ok, error = null) => {
      try { await db.from('send_log').insert({ job_id: job.id, ok, error }) }
      catch { /* best-effort: 이력 기록 실패는 발송에 영향 없음 */ }
    }
    try {
      const subject = job.use_index ? `[${job.send_count + 1}] ${job.subject}` : job.subject

      let sendOpts = { sender: job.sender }
      if (job.sender_account_id) {
        const { data: account, error: accErr } = await db
          .from('sender_accounts')
          .select('*')
          .eq('id', job.sender_account_id)
          .single()
        if (accErr || !account) throw new Error(`Sender account not found: ${job.sender_account_id}`)
        sendOpts = { senderEmail: account.email, senderPassword: account.app_password }
      }

      for (const recipient of job.recipients) {
        await sendMail({ ...sendOpts, to: recipient, subject, body: job.body, attachments: job.attachments })
      }

      const { error: updateErr } = await db
        .from('mail_jobs')
        .update({ last_sent_at: new Date().toISOString(), send_count: job.send_count + 1 })
        .eq('id', job.id)
      if (updateErr) throw updateErr
      await logSend(true)
    } catch (err) {
      await logSend(false, String(err?.message ?? err).slice(0, 500))
      throw err
    }
  })
)
```

(send_log insert는 `.insert()`만 호출 — select 체이닝 없음. 테스트 모킹과 일치.)

- [ ] **Step 5: 통과 확인** — Run: `npx vitest run server/routes/mailer.test.js` → 전부 PASS (기존 테스트 포함 — 기존 GET /jobs 테스트는 recent_sends 병합으로 mockFrom 호출이 1회 더 발생하므로 깨지면 mock 추가로 보정).

- [ ] **Step 6: SQL Editor 적용 안내 출력** — 마이그레이션 SQL을 사용자에게 제시하고 Supabase SQL Editor에서 실행 요청. **`supabase db push` 절대 금지.** 적용 전에도 서버는 best-effort로 정상 동작하므로 블로킹 아님.

- [ ] **Step 7: 커밋** — `git add -A && git commit -m "feat(mailer): send_log 발송 이력 기록 + GET /jobs recent_sends 병합"`

---

### Task 6: Mailer 행 리스트 전환 + 동작 개선

**Files:**
- Create: `src/components/mailer/JobRow.jsx` (JobCard 대체)
- Create: `src/components/shared/MoreMenu.jsx`
- Create: `src/components/mailer/HeartbeatBar.jsx`
- Modify: `src/pages/MailerPage.jsx`
- Delete: `src/components/mailer/JobCard.jsx`
- Modify: `src/index.css` (행·그룹·스켈레톤·토글 CSS — 기존 job-card 섹션 교체)

- [ ] **Step 1: MoreMenu.jsx** (의존성 없는 드롭다운):

```jsx
import { useState, useRef, useEffect } from 'react'
import { MoreHorizontal } from 'lucide-react'

export default function MoreMenu({ items, label = '더보기' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <div className="more-menu" ref={ref}>
      <button className="more-trigger" onClick={() => setOpen(o => !o)} aria-label={label} aria-expanded={open} aria-haspopup="menu">
        <MoreHorizontal size={15} />
      </button>
      {open && (
        <div className="more-list" role="menu">
          {items.filter(Boolean).map(({ icon: Icon, text, danger, onClick }) => (
            <button key={text} role="menuitem" className={`more-item${danger ? ' danger' : ''}`}
              onClick={() => { setOpen(false); onClick() }}>
              {Icon && <Icon size={13} />} {text}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: HeartbeatBar.jsx**:

```jsx
const SLOTS = 10

export default function HeartbeatBar({ sends = [] }) {
  const padded = [...Array(Math.max(0, SLOTS - sends.length)).fill(null), ...sends.slice(-SLOTS)]
  if (sends.length === 0) {
    return <span className="heartbeat-empty">이력 없음</span>
  }
  return (
    <div className="heartbeat" aria-label={`최근 발송 ${sends.length}회`}>
      {padded.map((s, i) => (
        <span
          key={i}
          className={`hb-slot${s == null ? ' empty' : s.ok ? ' ok' : ' fail'}`}
          title={s ? `${new Date(s.sent_at).toLocaleString('ko-KR')} · ${s.ok ? '성공' : '실패'}` : undefined}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 3: JobRow.jsx** — JobCard를 대체하는 컴팩트 행 (dnd-kit 유지):

```jsx
import { useState } from 'react'
import { Pencil, Trash2, Copy, GripVertical, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { nextSendAt, formatNextSend } from '../../lib/datetime.js'
import HeartbeatBar from './HeartbeatBar.jsx'
import MoreMenu from '../shared/MoreMenu.jsx'

function intervalLabel(minutes) {
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60}시간마다`
  return `${minutes}분마다`
}

export default function JobRow({ job, selected, onSelect, onToggle, onEdit, onDelete, onDuplicate, onResetCount, senders, toggling }) {
  const [recipientsOpen, setRecipientsOpen] = useState(false)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: job.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }

  const lastFailed = job.recent_sends?.length > 0 && !job.recent_sends[job.recent_sends.length - 1].ok
  const dotClass = lastFailed ? 'fail' : job.is_active ? 'ok' : 'idle'
  const next = job.is_active ? formatNextSend(nextSendAt(job.last_sent_at, job.interval_minutes)) : null
  const senderEmail = senders?.find(s => s.id === job.sender_account_id)?.email

  return (
    <div ref={setNodeRef} style={style} className={`job-row${lastFailed ? ' failed' : ''}${selected ? ' selected' : ''}`}>
      <div className="job-row-main">
        <button className="drag-handle" {...attributes} {...listeners} aria-label="순서 변경"><GripVertical size={14} /></button>
        <input type="checkbox" className="job-checkbox" checked={selected} onChange={e => onSelect(e.target.checked)} aria-label={`${job.name} 선택`} />
        <span className={`status-dot ${dotClass}`} />
        <div className="job-row-title">
          <span className="job-row-name">{job.name}</span>
          <span className="job-row-sub">
            <span className="mono">{intervalLabel(job.interval_minutes)}</span>
            {next && <> · 다음 발송: <span className="mono job-next">{next}</span></>}
            {lastFailed && <span className="job-fail-label"> · 최근 발송 실패</span>}
          </span>
        </div>
        <HeartbeatBar sends={job.recent_sends ?? []} />
        <button
          className={`switch${job.is_active ? ' on' : ''}`}
          onClick={onToggle}
          disabled={toggling}
          role="switch"
          aria-checked={job.is_active}
          aria-label={job.is_active ? `${job.name} 중지` : `${job.name} 시작`}
        >
          <span className="switch-knob" />
        </button>
        <MoreMenu label={`${job.name} 작업 메뉴`} items={[
          { icon: Pencil, text: '수정', onClick: onEdit },
          { icon: Copy, text: '복제', onClick: onDuplicate },
          job.use_index && { icon: RotateCcw, text: '순번 초기화', onClick: onResetCount },
          { icon: Trash2, text: '삭제', danger: true, onClick: onDelete },
        ]} />
      </div>
      <div className="job-row-meta">
        {senderEmail && <span className="mono">{senderEmail}</span>}
        <button className="recipient-toggle" onClick={() => setRecipientsOpen(o => !o)}>
          수신자 {job.recipients.length}명 {recipientsOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </button>
        <span>누적 {job.send_count}회</span>
      </div>
      {recipientsOpen && (
        <div className="recipient-list">
          {job.recipients.map(email => <div key={email} className="recipient-list-item mono">{email}</div>)}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: MailerPage.jsx 개선** — 변경 요점 (전체 파일 수정):

```jsx
// 추가 import
import { toast } from 'sonner'
import { useSearchParams } from 'react-router-dom'
import ConfirmDialog from '../components/shared/ConfirmDialog.jsx'
import JobRow from '../components/mailer/JobRow.jsx'

// state 추가
const [confirm, setConfirm] = useState(null)        // { title, message, confirmLabel, danger, action }
const [initialLoading, setInitialLoading] = useState(true)
const [togglingIds, setTogglingIds] = useState(new Set())
const [searchParams, setSearchParams] = useSearchParams()

// 커맨드 팔레트 쿼리 해석 (useEffect)
useEffect(() => {
  if (searchParams.get('new') === '1') { setEditJob(null); setShowModal(true); setSearchParams({}, { replace: true }) }
  if (searchParams.get('tab') === 'senders') { setPage('senders'); setSearchParams({}, { replace: true }) }
}, [searchParams, setSearchParams])

// refreshJobs: 첫 로드 후 setInitialLoading(false) (finally에서)

// 낙관적 토글 + 롤백
const handleToggle = async (job) => {
  const nextActive = !job.is_active
  setTogglingIds(prev => new Set(prev).add(job.id))
  setJobs(prev => prev.map(j => j.id === job.id ? { ...j, is_active: nextActive } : j))
  try {
    await updateJob(job.id, { is_active: nextActive }, password)
    toast.success(nextActive ? `"${job.name}" 시작됨` : `"${job.name}" 중지됨`)
  } catch {
    setJobs(prev => prev.map(j => j.id === job.id ? { ...j, is_active: !nextActive } : j))
    toast.error('상태 변경에 실패했습니다')
  } finally {
    setTogglingIds(prev => { const s = new Set(prev); s.delete(job.id); return s })
  }
}

// 삭제 — ConfirmDialog 경유
const requestDelete = (job) => setConfirm({
  title: '작업 삭제', message: `"${job.name}" 작업을 삭제할까요? 되돌릴 수 없습니다.`,
  confirmLabel: '삭제', danger: true,
  action: async () => {
    try { await deleteJob(job.id, password); setJobs(prev => prev.filter(j => j.id !== job.id)); toast.success('작업을 삭제했습니다') }
    catch { toast.error('삭제에 실패했습니다') }
  },
})
const requestDeleteSelected = () => setConfirm({
  title: '작업 일괄 삭제', message: `선택한 ${selectedIds.size}개 작업을 삭제할까요? 되돌릴 수 없습니다.`,
  confirmLabel: `${selectedIds.size}개 삭제`, danger: true,
  action: async () => { /* 기존 handleDeleteSelected 본문 + try/catch + toast */ },
})
const requestResetCount = (job) => setConfirm({
  title: '순번 초기화', message: `"${job.name}"의 발송 순번을 0으로 초기화할까요?`,
  confirmLabel: '초기화',
  action: async () => {
    try { const j = await updateJob(job.id, { send_count: 0 }, password); setJobs(prev => prev.map(x => x.id === j.id ? j : x)); toast.success('순번을 초기화했습니다') }
    catch { toast.error('초기화에 실패했습니다') }
  },
})
const requestDeleteSender = (id) => setConfirm({
  title: '발신 계정 삭제', message: '이 발신 계정을 삭제할까요?', confirmLabel: '삭제', danger: true,
  action: async () => {
    try { await deleteSender(id, password); setSenders(prev => prev.filter(s => s.id !== id)); toast.success('계정을 삭제했습니다') }
    catch { toast.error('삭제에 실패했습니다') }
  },
})

// handleDragEnd — API 호출을 업데이터 밖으로 + 실패 토스트
const handleDragEnd = ({ active, over }) => {
  if (!over || active.id === over.id) return
  const oldIndex = jobs.findIndex(j => j.id === active.id)
  const newIndex = jobs.findIndex(j => j.id === over.id)
  const reordered = arrayMove(jobs, oldIndex, newIndex)
  setJobs(reordered)
  reorderJobs(reordered.map(j => j.id), password).catch(() => toast.error('순서 저장에 실패했습니다'))
}

// 나머지 mutation(handleCreate/handleUpdate/handleDuplicate/handleCreateSender)에도 try/catch + toast.success/error
```

렌더부:
- 활성/중지 그룹: `const active = jobs.filter(j => j.is_active); const inactive = jobs.filter(j => !j.is_active)` — 단일 DndContext + 단일 SortableContext(items: jobs 전체) 유지, 렌더만 `<div className="job-group-head">활성 ({active.length})</div>` → active rows → `중지됨 (N)` → inactive rows 순.
- `initialLoading`일 때 스켈레톤 3개: `<div className="job-skeleton" /> × 3`
- 빈 상태: `작업이 없습니다` + `[+ 새 작업]` 버튼.
- JobCard → JobRow 교체, `onDelete={() => requestDelete(job)}` 등 confirm 경유로 연결, `toggling={togglingIds.has(job.id)}`.
- 말미에 `{confirm && <ConfirmDialog {...confirm} onConfirm={async () => { await confirm.action(); setConfirm(null) }} onCancel={() => setConfirm(null)} />}`

- [ ] **Step 5: JobCard.jsx 삭제** — `git rm src/components/mailer/JobCard.jsx`

- [ ] **Step 6: CSS — job-card 섹션을 행 리스트로 교체**:

```css
/* ── 작업 행 리스트 ── */
.job-list { max-width: 920px; margin: 24px auto; padding: 0 24px; display: flex; flex-direction: column; gap: 2px; }
.job-group-head {
  font-size: 12px; font-weight: 600; color: var(--color-text-secondary);
  padding: 16px 4px 6px; display: flex; align-items: center; gap: 6px;
}
.job-row {
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-subtle);
  border-radius: 10px; padding: 10px 14px;
  transition: border-color 150ms, background 150ms;
}
.job-row:hover { border-color: var(--color-border-strong); }
.job-row.failed { border-left: 3px solid var(--color-status-error); background: color-mix(in srgb, var(--color-status-error) 6%, var(--color-bg-surface)); }
.job-row.selected { border-color: color-mix(in srgb, var(--color-status-error) 40%, transparent); }
.job-row-main { display: flex; align-items: center; gap: 10px; min-height: 36px; }
.job-row-title { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.job-row-name { font-size: 14px; font-weight: 600; color: var(--color-text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.job-row-sub { font-size: 12px; color: var(--color-text-secondary); }
.job-next { color: var(--color-text-primary); }
.job-fail-label { color: var(--color-status-error); font-weight: 600; }
.job-row-meta { display: flex; gap: 14px; font-size: 12px; color: var(--color-text-secondary); padding: 4px 0 0 58px; }

.status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.status-dot.ok { background: var(--color-status-ok); box-shadow: 0 0 6px color-mix(in srgb, var(--color-status-ok) 50%, transparent); }
.status-dot.idle { background: var(--color-status-idle); }
.status-dot.fail { background: var(--color-status-error); box-shadow: 0 0 6px color-mix(in srgb, var(--color-status-error) 50%, transparent); }

/* ── 하트비트 바 ── */
.heartbeat { display: flex; gap: 2px; align-items: flex-end; height: 16px; flex-shrink: 0; }
.hb-slot { width: 5px; border-radius: 1.5px; height: 100%; }
.hb-slot.ok { background: color-mix(in srgb, var(--color-status-ok) 55%, transparent); }
.hb-slot.fail { background: var(--color-status-error); }
.hb-slot.empty { background: var(--color-border-subtle); height: 60%; }
.heartbeat-empty { font-size: 11px; color: var(--color-text-faint); flex-shrink: 0; }

/* ── 토글 스위치 ── */
.switch {
  width: 34px; height: 20px; border-radius: 999px; flex-shrink: 0;
  background: var(--color-bg-hover); border: 1px solid var(--color-border-strong);
  position: relative; cursor: pointer; padding: 0; transition: background 150ms;
}
.switch.on { background: color-mix(in srgb, var(--color-status-ok) 35%, var(--color-bg-hover)); border-color: var(--color-status-ok); }
.switch:disabled { opacity: 0.5; cursor: wait; }
.switch-knob {
  position: absolute; top: 2px; left: 2px; width: 14px; height: 14px;
  border-radius: 50%; background: var(--color-text-primary); transition: transform 150ms;
}
.switch.on .switch-knob { transform: translateX(14px); background: var(--color-status-ok); }

/* ── 더보기 메뉴 ── */
.more-menu { position: relative; flex-shrink: 0; }
.more-trigger {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 7px;
  background: none; border: none; cursor: pointer; color: var(--color-text-secondary);
}
.more-trigger:hover { background: var(--color-bg-hover); color: var(--color-text-primary); }
.more-list {
  position: absolute; right: 0; top: calc(100% + 4px); z-index: 30;
  min-width: 140px; padding: 4px;
  background: var(--color-bg-raised); border: 1px solid var(--color-border-strong);
  border-radius: 10px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  display: flex; flex-direction: column;
}
.more-item {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px; border-radius: 7px; font-size: 13px; text-align: left;
  background: none; border: none; cursor: pointer; color: var(--color-text-primary);
}
.more-item:hover { background: var(--color-bg-hover); }
.more-item.danger { color: var(--color-status-error); }
.more-item.danger:hover { background: color-mix(in srgb, var(--color-status-error) 12%, transparent); }

/* ── 스켈레톤 ── */
.job-skeleton {
  height: 58px; border-radius: 10px;
  background: linear-gradient(90deg, var(--color-bg-surface) 25%, var(--color-bg-hover) 50%, var(--color-bg-surface) 75%);
  background-size: 200% 100%;
  animation: skeleton 1.4s ease infinite;
}
@keyframes skeleton { to { background-position: -200% 0; } }
```

기존 `.job-card*`, `.btn-start/.btn-stop`, `.job-badge-gmail/.job-badge-ms`, `.job-status-dot*` 등 행 리스트로 대체된 셀렉터는 삭제.

- [ ] **Step 7: 검증** — `npm test` PASS, `npm run build` 성공, dev 서버에서 행 리스트·토글·삭제 확인·토스트·그룹·드래그 확인.

- [ ] **Step 8: 커밋** — `git add -A && git commit -m "feat(mailer): 컴팩트 행 리스트 + 하트비트 바 + 확인 다이얼로그·토스트·낙관적 토글"`

---

### Task 7: JobModal·SenderModal·TagInput 개선

**Files:**
- Create: `src/lib/email.js` / Test: `src/lib/email.test.js`
- Modify: `src/components/mailer/TagInput.jsx`, `JobModal.jsx`, `SenderModal.jsx`, `src/pages/MailerPage.jsx`(sender 생성 핸들러)

- [ ] **Step 1: 이메일 유틸 TDD — 실패하는 테스트** `src/lib/email.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { isValidEmail, parseEmails } from './email.js'

describe('isValidEmail', () => {
  it.each(['a@b.co', 'first.last+tag@sub.domain.io'])('유효: %s', (e) => expect(isValidEmail(e)).toBe(true))
  it.each(['abc', 'a@', '@b.c', 'a b@c.d', 'a@b'])('무효: %s', (e) => expect(isValidEmail(e)).toBe(false))
})

describe('parseEmails', () => {
  it('쉼표·세미콜론·공백·줄바꿈 혼합 분리', () => {
    expect(parseEmails('a@b.co, c@d.io;e@f.kr\ng@h.com x@y.z지않은')).toEqual({
      valid: ['a@b.co', 'c@d.io', 'e@f.kr', 'g@h.com'],
      invalid: ['x@y.z지않은'],
    })
  })
})
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/lib/email.test.js` → FAIL

- [ ] **Step 3: 구현** `src/lib/email.js`:

```js
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/

export function isValidEmail(value) {
  return EMAIL_RE.test(value)
}

export function parseEmails(text) {
  const tokens = text.split(/[\s,;]+/).map(t => t.trim()).filter(Boolean)
  return {
    valid: tokens.filter(isValidEmail),
    invalid: tokens.filter(t => !isValidEmail(t)),
  }
}
```

- [ ] **Step 4: 통과 확인 후 TagInput 적용** — TagInput.jsx: 추가 시 `isValidEmail` 검사(무효면 추가 거부 + `input-invalid` 클래스 잠깐 부여), `onPaste`에서 `parseEmails`로 일괄 추가(유효만, 무효 있으면 toast.error로 안내). CSS:

```css
.tag-input-wrap.input-invalid { border-color: var(--color-status-error); animation: shake 200ms; }
@keyframes shake { 25% { transform: translateX(-3px); } 75% { transform: translateX(3px); } }
```

- [ ] **Step 5: JobModal·SenderModal을 Modal.jsx 기반으로 전환**
- 둘 다 최상위 `<div className="modal-overlay">…` 구조를 `<Modal title={…} onClose={handleClose}>`로 교체 (JobModal은 dirty-check가 있으므로 기존 handleClose 그대로 onClose로 전달).
- 모든 `<label className="form-label">`에 `htmlFor` + 대응 input `id` 연결 (`job-name`, `job-sender`, `job-subject`, `job-body`, `job-interval`, `sender-email`, `sender-pw` 등).
- JobModal의 `alert(err.message)` 2곳 → `toast.error(err.message)`.
- SenderModal: `loading` prop 추가, 저장 버튼 `{loading ? '저장 중…' : '추가'}` + disabled. MailerPage `handleCreateSender`에 try/catch + `setSenderLoading` + toast, 실패 시 모달 유지.

- [ ] **Step 6: 검증 + 커밋** — `npm test` PASS → `git add -A && git commit -m "feat(mailer): 이메일 검증·일괄 붙여넣기 + 모달 접근성·로딩 일관화"`

---

### Task 8: Grafana 재스타일

**Files:**
- Modify: `src/pages/GrafanaPage.jsx`, `src/index.css` (grafana 섹션)

- [ ] **Step 1: 요약 배너·Stat 카드·로그 테이블 마크업 보강** — GrafanaPage.jsx:
- 배너: 이모지 제거, `<span className="status-dot ok|fail" />` + "모두 정상입니다" / "이상 N건 — 점검 필요", 우측 시각에 `mono` 클래스.
- Stat 카드: 값에 `mono` 클래스(`grafana-card-value`), 섹션 제목의 이모지(📈/🔍) 제거하고 텍스트만.
- 로그 행: `<tr>`에 클릭 핸들러로 `expanded` state 토글 — 펼치면 `r.msg` 전문(`white-space: pre-wrap`) 표시, 접으면 `slice(0, 180)`. 시각 셀에 `mono`.

- [ ] **Step 2: CSS** — grafana 섹션 교체(토큰은 Task 1에서 이미 치환됨, 구조만 보강):

```css
.grafana-summary {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 16px; border-radius: 10px; font-weight: 600; font-size: 14px; margin-bottom: 20px;
  border: 1px solid var(--color-border-subtle);
}
.grafana-summary.ok { background: color-mix(in srgb, var(--color-status-ok) 8%, transparent); color: var(--color-status-ok); }
.grafana-summary.alert { background: color-mix(in srgb, var(--color-status-error) 10%, transparent); color: var(--color-status-error); }
.grafana-time { margin-left: auto; font-size: 12px; font-weight: 400; color: var(--color-text-secondary); }

.grafana-card { gap: 2px; padding: 14px 16px; border-left-width: 1px; }
.grafana-card-value { font-size: 26px; font-weight: 700; color: var(--color-text-primary); }
.grafana-card.warn .grafana-card-value { color: var(--color-status-error); }
.grafana-card.warn { border-color: color-mix(in srgb, var(--color-status-error) 40%, transparent); background: color-mix(in srgb, var(--color-status-error) 6%, var(--color-bg-surface)); }
.grafana-card.na .grafana-card-value { color: var(--color-text-faint); font-size: 15px; }

.grafana-log-table td { padding: 7px 10px; }
.grafana-log-table tr { cursor: pointer; }
.grafana-log-table tr:hover td { background: var(--color-bg-hover); }
.grafana-log-table tr.expanded .grafana-log-msg { white-space: pre-wrap; }
.grafana-log-row-border { border-left: 3px solid var(--color-status-error); }
.grafana-log-time { text-align: right; }
```

- [ ] **Step 3: 검증 + 커밋** — `npm test` PASS → `git commit -am "feat(grafana): Stat 패널·심각도 보더·로그 아코디언 재스타일"`

---

### Task 9: 허브 홈·로그인·챗봇

**Files:**
- Modify: `src/pages/HubPage.jsx`, `src/pages/LoginPage.jsx`, `src/pages/ChatbotPage.jsx`, `src/index.css`

- [ ] **Step 1: HubPage 상태 배너** — `getJobs`로 작업 로드(best-effort), 배너 계산:

```jsx
const [jobs, setJobs] = useState(null) // null = 로딩/실패 → 배너 생략
useEffect(() => {
  getJobs(getCookie()).then(setJobs).catch(() => {})
}, [])

const failCount = jobs?.filter(j => j.recent_sends?.length && !j.recent_sends[j.recent_sends.length - 1].ok).length ?? 0
const activeCount = jobs?.filter(j => j.is_active).length ?? 0
```

배너 렌더(`hub-main` 최상단):

```jsx
{jobs && (
  <div className={`hub-status-banner ${failCount ? 'alert' : 'ok'}`}>
    <span className={`status-dot ${failCount ? 'fail' : 'ok'}`} />
    {failCount ? `Mailer: 최근 발송 ${failCount}건 실패 — 확인이 필요합니다` : `모두 정상입니다 · 활성 작업 ${activeCount}개`}
  </div>
)}
```

Mailer 툴 카드에 상태 도트: `{tool.id === 'mailer' && jobs && <span className={`status-dot ${failCount ? 'fail' : 'ok'}`} style={{ position: 'absolute', top: 14, right: 14 }} />}` — 인라인 스타일 대신 `.hub-card-dot` 클래스로. 로그아웃 버튼은 제거(레일 담당), 인라인 색 스타일도 클래스로 승격.

CSS:

```css
.hub-status-banner {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 16px; border-radius: 10px; font-size: 14px; font-weight: 600; margin-bottom: 24px;
  border: 1px solid var(--color-border-subtle);
}
.hub-status-banner.ok { background: color-mix(in srgb, var(--color-status-ok) 7%, transparent); color: var(--color-status-ok); }
.hub-status-banner.alert { background: color-mix(in srgb, var(--color-status-error) 9%, transparent); color: var(--color-status-error); }
.hub-card-dot { position: absolute; top: 14px; right: 14px; }
.hub-card-empty-name { color: var(--color-text-faint); }
```

- [ ] **Step 2: LoginPage** — `loading` state 추가: 제출 중 버튼 `'확인 중…'` + disabled, 실패 시 input에 `gate-input-error` 클래스 + `aria-invalid`:

```css
.gate-input-error { border-color: var(--color-status-error); }
```

- [ ] **Step 3: ChatbotPage 빈 상태**:

```jsx
import { Bot } from 'lucide-react'
import AppHeader from '../components/shared/AppHeader.jsx'

export default function ChatbotPage() {
  return (
    <div className="app">
      <AppHeader toolName="챗봇 모니터링" />
      <div className="coming-soon">
        <Bot size={48} className="coming-soon-icon" />
        <p className="coming-soon-title">챗봇 모니터링을 준비하고 있어요</p>
        <p className="coming-soon-desc">챗봇 활성화 현황 추적과 응답 품질 리포트 기능이 추가될 예정입니다.</p>
      </div>
    </div>
  )
}
```

```css
.coming-soon { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 100px 24px; text-align: center; }
.coming-soon-icon { color: color-mix(in srgb, var(--color-accent) 50%, transparent); }
.coming-soon-title { font-size: 16px; font-weight: 600; color: var(--color-text-primary); margin: 0; }
.coming-soon-desc { font-size: 13px; color: var(--color-text-secondary); margin: 0; max-width: 320px; }
```

- [ ] **Step 4: 검증 + 커밋** — `npm test` PASS → `git commit -am "feat(pages): 허브 상태 배너 + 로그인 로딩 + 챗봇 빈 상태"`

---

### Task 10: 반응형·접근성 마무리 + 전체 검증

**Files:**
- Modify: `src/index.css` (미디어 쿼리), 잔여 인라인 스타일 정리

- [ ] **Step 1: ~640px 브레이크포인트**:

```css
@media (max-width: 640px) {
  .layout { flex-direction: column-reverse; }
  .icon-rail {
    width: 100%; height: 56px; flex-direction: row; justify-content: space-around;
    padding: 0 12px; position: fixed; bottom: 0; top: auto; z-index: 40;
    border-right: none; border-top: 1px solid var(--color-border-subtle);
  }
  .rail-logo { margin: 0; }
  .rail-tools { flex-direction: row; flex: 0 1 auto; gap: 8px; }
  .rail-item.active::before { left: 50%; transform: translateX(-50%); top: -9px; width: 18px; height: 2px; }
  .rail-logout { margin: 0; }
  .layout-main { padding-bottom: 64px; }
  .hub-grid { grid-template-columns: 1fr; }
  .job-row-main { flex-wrap: wrap; }
  .heartbeat { order: 5; width: 100%; margin-top: 6px; }
  .job-row-meta { padding-left: 0; flex-wrap: wrap; }
  .modal { max-height: 100dvh; height: 100dvh; max-width: 100%; border-radius: 0; }
  .modal-overlay { padding: 0; }
  .grafana-cards { grid-template-columns: repeat(2, 1fr); }
}
```

- [ ] **Step 2: 잔여 인라인 스타일·죽은 CSS 정리** — `nav-tabs`의 `style={{ padding }}` → `.nav-tabs { padding: 0 24px; }` CSS로, ChatbotPage marginTop 등 제거. 사용처 없는 셀렉터(`.gate-*` 외 기존 `.job-card*`, `.btn-start` 등) 삭제 확인: `grep -o 'className="[^"]*"' -r src | ...`로 사용 클래스 추출 대조.

- [ ] **Step 3: 전체 검증**

Run: `npm test` → 전체 PASS
Run: `npm run lint` → 에러 0
Run: `npm run build` → 성공
Run: dev 서버에서 전 화면 순회(로그인 → 허브 → Mailer 행·모달·삭제·토스트 → Grafana → 챗봇), 모바일 뷰포트 확인.

- [ ] **Step 4: 커밋** — `git add -A && git commit -m "feat(design): 반응형 + 잔여 정리 — NOC 리디자인 완료"`

---

## Self-Review 체크 결과

- 스펙 §1 토큰 → Task 1 / §2 레일·팔레트 → Task 4 / §3 Mailer → Task 6 / §4 Grafana → Task 8 / §5 허브·로그인·챗봇 → Task 9 / §6 send_log → Task 5 / §7 공통 → Task 3·6·7·10 / §8 의존성 → Task 3 / §9 테스트 → Task 2·3·5·7 / §10 에러 처리 → Task 6·7. 누락 없음.
- 타입 일관성: `recent_sends: [{ok, sent_at}]` (서버 Task 5 ↔ JobRow·HubPage Task 6·9 동일), `nextSendAt/formatNextSend` 시그니처 Task 2 ↔ Task 6 일치, ConfirmDialog props Task 3 ↔ Task 6 일치.
