# 챗봇 모니터링 — 속성명+값 기반 요소 지정 설계

- 날짜: 2026-07-03
- 대상: CS SmartHub 챗봇 모니터링 (`mailer` 리포)
- 브랜치: `feature/chatbot-attr-click`

## 배경 / 문제

일일 챗봇 체크(`scripts/chatbot-check.mjs`, Playwright)는 시나리오 스텝마다 요소를
**① 보이는 텍스트** 또는 **② CSS 셀렉터**로 찾는다. 2026-07-02 체크에서 Coway가
`button_not_found: "비회원 챗봇안내" 버튼을 찾지 못함`으로 반복 실패했다. 텍스트 매칭이
불안정하고, 그 버튼을 유일하게 집어낼 CSS 셀렉터를 손으로 만들기 어렵다.

요청: **하나의 속성명과 값**을 기준으로 요소를 누를 수 있게 한다
(예: `data-action="guest-guide"`).

## 목표

- 클릭 대상과 발화(입력창) 위치를 **속성명+값**으로 지정 가능하게 한다.
- 값은 **정확히 일치**로 매칭한다(`[name="value"]`).
- UI에서 **찾기 방식(텍스트 / 속성 / CSS 셀렉터)**을 드롭다운으로 명시 선택한다.
- 기존 시나리오(텍스트/CSS)는 그대로 동작한다(하위호환).

## 범위 밖 (이번에 안 함)

- goto timeout(현대캐피탈·현대커머셜·오뚜기), 하나은행 입력창 자동탐색 개선,
  현대카드 기대키워드 갱신은 별도 이슈. (단 하나은행 등은 본 기능으로 추후 셀렉터
  지정만으로 해결 가능.)

## 접근 (채택: A안)

**A안 — 속성 모드를 셀렉터로 컴파일.** `normalizeStep`이 `attr:{name,value}`를
안전 이스케이프한 `[name="value"]` CSS 셀렉터로 변환한다. 러너의 기존 셀렉터 탐색
경로(`findClickable`/`findInput`)를 그대로 재사용하므로 러너 수정이 최소화되고,
셀렉터 조립 로직을 순수 함수로 분리해 브라우저 없이 단위테스트할 수 있다.

(기각) B안: 러너에 attr 분기 직접 추가 — 코드 경로 증가, 브라우저 없이는 테스트 곤란,
A안 대비 이점 없음.

## 데이터 스키마 (하위호환)

스텝 저장 형식에 선택적 `attr` 필드를 추가한다. 탐색 방식은 **존재하는 필드로 구분**한다.

| 모드 | 저장 형태 | 탐색 |
|---|---|---|
| 텍스트 | `{ type, click|say, expect }` | 기존 텍스트 매칭 |
| CSS | `{ …, selector: "#btn" }` | 기존 CSS |
| 속성(신규) | `{ …, attr: { name: "data-action", value: "guest-guide" } }` | `[data-action="guest-guide"]` |

- 우선순위: `attr`가 있으면 속성 모드, 없고 `selector`가 있으면 CSS 모드, 둘 다 없으면 텍스트 모드.
- `attr`와 `selector`는 상호배타로 저장한다(UI가 모드 하나만 기록).

## 러너 변경 (`scripts/lib/judge.mjs`, `scripts/chatbot-check.mjs`)

1. `judge.mjs`에 순수 함수 `buildAttrSelector(name, value)` 추가.
   - 반환: `[<name>="<escaped value>"]`.
   - 값 이스케이프: CSS 문자열에서 위험한 문자(`\`, `"`)를 이스케이프한다.
     구현은 `"\\"` → `"\\\\"`, `"\""` → `"\\\""` 치환으로 처리.
   - 속성명은 `data-*`, `aria-label`, `id` 등 유효 식별자 가정(트림만; 비면 무시).
2. `normalizeStep(step)`:
   - `attr?.name`이 트림 후 존재하면 `selector = buildAttrSelector(attr.name, attr.value ?? '')`.
   - 아니면 기존대로 `selector = step.selector?.trim() || null`.
   - 반환 형태(`{ type, text, expect, selector }`)는 불변 → `chatbot-check.mjs`
     의 `findClickable`/`findInput`은 **수정 불필요**.
3. 클릭·발화 모두 적용. 발화는 입력창 위치만 속성으로 지정하고, 타이핑할 메시지는
   기존 `say` 텍스트를 그대로 사용한다.

## UI 변경 (`src/components/chatbot/BotModal.jsx`)

⚙ 셀렉터 패널을 **찾기 방식 드롭다운 + 조건부 입력칸**으로 확장한다.

- 스텝 편집 상태에 `findBy: 'text' | 'attr' | 'css'`, `attrName`, `attrValue` 추가.
- 드롭다운 옵션: `텍스트` / `속성` / `CSS 셀렉터`.
  - `속성` → `속성명`(예: `data-action`) · `속성값`(예: `guest-guide`) 두 칸 표시.
  - `CSS` → 기존 셀렉터 한 칸(`selector`).
  - `텍스트` → 추가 입력칸 없음(상단 텍스트로 탐색).
- 상단 텍스트칸의 역할(현행 유지):
  - 발화(say) 스텝: 항상 "타이핑할 메시지". 모드와 무관하게 항상 표시·요구.
  - 버튼(click) 스텝: 텍스트 모드일 때만 "탐색용 버튼 텍스트"로 사용. 속성/CSS 모드에서는
    사용하지 않음(칸은 그대로 두되 탐색에 미반영).
- `toEditable(step)`: `attr` 있으면 `findBy='attr'`, `selector` 있으면 `'css'`, 아니면 `'text'`.
- `toStored(step)`:
  - `attr` 모드 → `{ …base, attr: { name: attrName.trim(), value: attrValue.trim() } }`
  - `css` 모드 → `selector.trim()`이 있으면 `{ …base, selector }`
  - `text` 모드 → base만.
- `stepValid`: 유효 조건 = `expect`가 있고, 다음 중 하나 —
  텍스트(`text`) 있음 / CSS(`selector`) 있음 / 속성(`attrName` && `attrValue`) 있음.
  - 발화(say) 스텝은 타이핑 메시지가 필요하므로 `text`(say 메시지)를 계속 요구한다
    (현행 동작 유지 — 위치 지정과 별개).
- 힌트 문구 업데이트: 속성 모드 설명 추가.

## 테스트

- `scripts/lib/judge.test.js`(신규 or 기존 테스트 옆): 
  - `buildAttrSelector`가 일반/이스케이프 필요 값(`"`, `\` 포함)을 올바른 셀렉터로 만드는지.
  - `normalizeStep`이 `attr` → `selector`(컴파일된 CSS)로 변환하고, `attr` 없으면
    기존 `selector`를 유지하는지.
- 수동 검증: 로컬 Playwright로 Coway 페이지를 열어 "비회원 챗봇안내" 버튼의 실제
  속성을 확인하고, 그 속성으로 클릭·기대키워드 노출까지 확인한다.

## 배포

- 직접 main 푸시 차단 → `feature/chatbot-attr-click` PR 생성 후 `gh pr merge`로
  Vercel 자동 배포. (프론트 배포. 러너는 GitHub Actions에서 실행되므로 main 반영 필요.)
