# 챗봇 속성명+값 기반 요소 지정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 챗봇 시나리오 스텝에서 클릭 대상·입력창을 하나의 속성명+값(`[name="value"]`)으로 지정할 수 있게 한다.

**Architecture:** `normalizeStep`이 `attr:{name,value}`를 안전 이스케이프한 CSS 셀렉터로 컴파일 → 러너의 기존 셀렉터 탐색 경로를 그대로 재사용(러너 로직 무수정). UI(BotModal)는 찾기 방식 드롭다운(텍스트/속성/CSS)으로 모드를 명시 선택.

**Tech Stack:** Node ESM, Playwright(러너), React + Vite(UI), Vitest(테스트).

## Global Constraints

- 하위호환: 기존 텍스트/CSS 스텝은 그대로 동작. 필드 존재로 모드 구분(`attr` > `selector` > 텍스트).
- `attr`와 `selector`는 상호배타 저장.
- 값 매칭은 정확히 일치(`[name="value"]`).
- 배포는 main 직접 푸시 금지 → PR + `gh pr merge`로 Vercel 자동 배포.
- 테스트 러너: `npm test` (= `vitest run`).

---

### Task 1: `buildAttrSelector` 순수 함수 + `normalizeStep` attr 변환

**Files:**
- Modify: `scripts/lib/judge.mjs`
- Test: `scripts/lib/judge.test.mjs`

**Interfaces:**
- Produces: `buildAttrSelector(name: string, value: string): string` — `[<name>="<escaped>"]` 반환.
- Modifies: `normalizeStep(step)` — 반환 형태 `{ type, text, expect, selector }` 불변. `attr.name`이 트림 후 있으면 `selector`를 컴파일된 CSS로 세팅.

- [ ] **Step 1: 실패 테스트 작성** — `scripts/lib/judge.test.mjs`의 `describe('normalizeStep' …)` 아래에 새 describe 추가.

```js
import { judgeStep, buildFailureMail, normalizeStep, buildAttrSelector } from './judge.mjs'

describe('buildAttrSelector', () => {
  it('일반 속성명+값 → CSS 속성 셀렉터', () => {
    expect(buildAttrSelector('data-action', 'guest-guide')).toBe('[data-action="guest-guide"]')
  })
  it('값의 큰따옴표·백슬래시를 이스케이프', () => {
    expect(buildAttrSelector('title', 'a"b\\c')).toBe('[title="a\\"b\\\\c"]')
  })
  it('이름·값 앞뒤 공백은 트림', () => {
    expect(buildAttrSelector(' id ', ' x ')).toBe('[id="x"]')
  })
})

describe('normalizeStep + attr', () => {
  it('attr 있으면 selector를 컴파일된 CSS로 세팅', () => {
    const r = normalizeStep({ type: 'click', click: '', expect: '완료', attr: { name: 'data-action', value: 'guest-guide' } })
    expect(r.selector).toBe('[data-action="guest-guide"]')
  })
  it('attr가 selector보다 우선', () => {
    const r = normalizeStep({ type: 'click', expect: 'x', selector: '#old', attr: { name: 'id', value: 'new' } })
    expect(r.selector).toBe('[id="new"]')
  })
  it('attr.name 비면 무시하고 기존 selector 유지', () => {
    expect(normalizeStep({ type: 'click', expect: 'x', selector: '#btn', attr: { name: '  ', value: 'y' } }).selector).toBe('#btn')
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd ~/IdeaProjects/mailer && npx vitest run scripts/lib/judge.test.mjs`
Expected: FAIL — `buildAttrSelector is not a function` / attr 케이스 selector 불일치.

- [ ] **Step 3: 최소 구현** — `scripts/lib/judge.mjs` 수정.

`buildAttrSelector` 추가 (파일 상단, `normalizeStep` 위):

```js
// 속성명+값 → CSS 속성 셀렉터. 값의 CSS 문자열 위험문자(\, ")를 이스케이프.
export function buildAttrSelector(name, value) {
  const escaped = String(value ?? '').trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return `[${String(name).trim()}="${escaped}"]`
}
```

`normalizeStep`을 아래로 교체:

```js
export function normalizeStep(step) {
  const type = step.type === 'click' ? 'click' : 'say'
  const attrName = step.attr?.name?.trim()
  const selector = attrName
    ? buildAttrSelector(step.attr.name, step.attr.value)
    : (step.selector?.trim() || null)
  return {
    type,
    text: type === 'click' ? step.click : step.say,
    expect: step.expect,
    selector,
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd ~/IdeaProjects/mailer && npx vitest run scripts/lib/judge.test.mjs`
Expected: PASS (기존 normalizeStep 테스트 포함 전부 통과).

- [ ] **Step 5: 커밋**

```bash
cd ~/IdeaProjects/mailer
git add scripts/lib/judge.mjs scripts/lib/judge.test.mjs
git commit -m "feat(chatbot): attr 셀렉터 컴파일 — buildAttrSelector + normalizeStep

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: BotModal — 찾기 방식 드롭다운 + 속성 입력칸

**Files:**
- Modify: `src/components/chatbot/BotModal.jsx`

**Interfaces:**
- Consumes: 스텝 저장 형식에 `attr: { name, value }` 추가 (Task 1의 normalizeStep이 소비).
- 편집 상태 필드 추가: `findBy: 'text'|'attr'|'css'`, `attrName`, `attrValue`.

- [ ] **Step 1: `emptyStep`/`toEditable`/`toStored`/`stepValid` 수정**

`emptyStep`:
```js
const emptyStep = () => ({ type: 'say', text: '', expect: '', selector: '', attrName: '', attrValue: '', findBy: 'text', showSel: false })
```

`toEditable(step)` 교체:
```js
function toEditable(step) {
  const type = step.type === 'click' ? 'click' : 'say'
  const selector = step.selector ?? ''
  const attrName = step.attr?.name ?? ''
  const attrValue = step.attr?.value ?? ''
  const findBy = attrName ? 'attr' : (selector ? 'css' : 'text')
  return {
    type,
    text: type === 'click' ? (step.click ?? '') : (step.say ?? ''),
    expect: step.expect ?? '',
    selector, attrName, attrValue, findBy,
    showSel: findBy !== 'text',
  }
}
```

`toStored(s)` 교체:
```js
function toStored({ type, text, expect, selector, attrName, attrValue, findBy }) {
  const base = type === 'click'
    ? { type: 'click', click: text.trim(), expect: expect.trim() }
    : { type: 'say', say: text.trim(), expect: expect.trim() }
  if (findBy === 'attr' && attrName.trim() && attrValue.trim())
    return { ...base, attr: { name: attrName.trim(), value: attrValue.trim() } }
  if (findBy === 'css' && selector.trim())
    return { ...base, selector: selector.trim() }
  return base
}
```

`stepValid(s)` 교체:
```js
const stepValid = (s) => {
  const hasLocator = s.type === 'say'
    ? s.text.trim() // 발화는 타이핑 메시지 필요
    : (s.findBy === 'attr' ? (s.attrName.trim() && s.attrValue.trim())
      : s.findBy === 'css' ? s.selector.trim()
      : s.text.trim())
  return hasLocator && s.expect.trim()
}
```

- [ ] **Step 2: ⚙ 패널을 드롭다운 + 조건부 입력칸으로 교체**

`{s.showSel && ( … )}` 블록(현재 selector 한 칸)을 아래로 교체:
```jsx
{s.showSel && (
  <div className="scenario-step-selector">
    <select
      className="form-select scenario-type"
      value={s.findBy}
      onChange={e => setStep(i, 'findBy', e.target.value)}
      aria-label={`스텝 ${i + 1} 찾기 방식`}
    >
      <option value="text">텍스트</option>
      <option value="attr">속성</option>
      <option value="css">CSS 셀렉터</option>
    </select>
    {s.findBy === 'attr' && (
      <>
        <input className="form-input mono" value={s.attrName}
          onChange={e => setStep(i, 'attrName', e.target.value)}
          placeholder="속성명 (예: data-action)" aria-label={`스텝 ${i + 1} 속성명`} />
        <input className="form-input mono" value={s.attrValue}
          onChange={e => setStep(i, 'attrValue', e.target.value)}
          placeholder="속성값 (예: guest-guide)" aria-label={`스텝 ${i + 1} 속성값`} />
      </>
    )}
    {s.findBy === 'css' && (
      <input className="form-input mono" value={s.selector}
        onChange={e => setStep(i, 'selector', e.target.value)}
        placeholder={s.type === 'click'
          ? '클릭할 요소 CSS 셀렉터 (예: #btn-reserve)'
          : '입력창 CSS 셀렉터 (예: #chat-input-text)'}
        aria-label={`스텝 ${i + 1} 셀렉터`} />
    )}
  </div>
)}
```

- [ ] **Step 3: 힌트 문구 갱신** — `form-hint` 마지막 문단에 속성 설명 추가:
```jsx
<p className="form-hint">
  발화는 입력창에 타이핑, 버튼은 화면의 해당 텍스트 버튼을 클릭합니다.
  ⚙로 찾기 방식(텍스트/속성/CSS)을 지정할 수 있습니다. 속성은 하나의 속성명+값이
  정확히 일치하는 요소를 찾습니다(예: data-action = guest-guide).
  기대 키워드는 버튼 텍스트와 다른 문구로. 매일 08:30 자동 체크.
</p>
```

- [ ] **Step 4: 빌드로 문법·참조 확인**

Run: `cd ~/IdeaProjects/mailer && npx vite build`
Expected: 빌드 성공 (BotModal 관련 에러 없음).

- [ ] **Step 5: 커밋**

```bash
cd ~/IdeaProjects/mailer
git add src/components/chatbot/BotModal.jsx
git commit -m "feat(chatbot): 시나리오 스텝 찾기 방식 드롭다운 + 속성명·값 입력

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Coway 실측 + 전체 테스트 + PR 배포

**Files:** (코드 변경 없음, 필요 시 Coway 봇 시나리오 데이터만 갱신)

- [ ] **Step 1: 전체 테스트**

Run: `cd ~/IdeaProjects/mailer && npm test`
Expected: 전부 PASS.

- [ ] **Step 2: Coway 페이지 실측** — 로컬 Playwright로 실제 속성 확인.

```bash
cd ~/IdeaProjects/mailer
node -e "import('playwright').then(async ({chromium})=>{const b=await chromium.launch();const p=await b.newPage();await p.goto('https://v2.coginsight.net/secure/service/#/66b150ad-af62-4751-872b-e1a75cb826e6?input=%7b%22text%22:%22%22%2c%22data%22:%7b%22channel%22:%22floating_pc%22%7d%7d',{waitUntil:'networkidle',timeout:30000}).catch(e=>console.log('goto:',e.message));await p.waitForTimeout(3000);for(const f of p.frames()){const h=await f.locator('text=비회원 챗봇안내').first().elementHandle().catch(()=>null);if(h){console.log('FRAME',f.url());console.log(await h.evaluate(el=>el.outerHTML.slice(0,300)));}}await b.close();})"
```
Expected: "비회원 챗봇안내" 요소의 outerHTML 출력 → 안정적 속성(id/data-*/aria-label) 확인.
- 안정 속성이 있으면 그 속성명+값으로 UI에서 Coway 스텝1을 설정(또는 DB 직접 갱신).
- 없으면(텍스트만 있음) 그 사실을 사용자에게 보고하고 후속 논의.

- [ ] **Step 3: PR 생성 + 머지 배포**

```bash
cd ~/IdeaProjects/mailer
git push -u origin feature/chatbot-attr-click
gh pr create --title "feat(chatbot): 속성명+값 기반 요소 지정" \
  --body "$(cat <<'EOF'
## 개요
챗봇 시나리오 스텝에서 클릭 대상·입력창을 하나의 속성명+값(`[name=\"value\"]`)으로 지정 가능.
Coway `button_not_found`(텍스트 매칭 실패) 대응.

## 변경
- `judge.mjs`: `buildAttrSelector` + `normalizeStep`이 attr→CSS 셀렉터 컴파일 (러너 무수정)
- `BotModal.jsx`: ⚙ 패널에 찾기 방식 드롭다운(텍스트/속성/CSS) + 속성명·값 입력
- 단위테스트 추가

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
gh pr merge --squash --delete-branch
```
Expected: PR 머지 → Vercel 자동 배포.

---

## Self-Review

- **Spec coverage:** 스키마(attr 필드)=Task1, 러너 컴파일=Task1, UI 드롭다운=Task2, 테스트=Task1·Task3, Coway 실측=Task3, 배포=Task3. 전부 커버.
- **Placeholder scan:** 모든 코드 스텝에 실제 코드 포함. 없음.
- **Type consistency:** `buildAttrSelector(name, value)`, `attr:{name,value}`, `findBy` 값('text'|'attr'|'css') Task 전반 일치.
