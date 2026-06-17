// 쿼리 행의 등록 가능 여부 판정 (순수 함수).
// 행 메타: _savedQuery(마지막 저장된 query, 신규는 undefined),
//          _test('untested'|'passed'|'failed'), _testedQuery(통과 시점 query).

export function rowIsGood(row) {
  if (!row) return false
  const label = String(row.label ?? '').trim()
  const query = String(row.query ?? '').trim()
  if (!label || !query) return false
  if (row.query === row._savedQuery) return true                  // 미변경(grandfather)
  return row._test === 'passed' && row._testedQuery === row.query // 현재 query로 테스트 통과
}

export function canSave(...lists) {
  return lists.every((list) => (list ?? []).every(rowIsGood))
}
