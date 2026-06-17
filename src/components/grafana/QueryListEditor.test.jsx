import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import QueryListEditor from './QueryListEditor.jsx'

const COLUMNS = [
  { key: 'label', label: '라벨' },
  { key: 'query', label: '쿼리', wide: true },
]
const newRow = () => ({ label: '', query: '', enabled: true })

function setup(items, props = {}) {
  const onChange = vi.fn()
  const onTest = props.onTest ?? vi.fn().mockResolvedValue({ ok: true })
  render(
    <QueryListEditor
      title="로그 쿼리"
      items={items}
      columns={COLUMNS}
      newRow={newRow}
      addLabel="+ 로그 쿼리 추가"
      onChange={onChange}
      onTest={onTest}
    />
  )
  return { onChange, onTest }
}

describe('QueryListEditor', () => {
  it('항목 행을 렌더한다', () => {
    setup([{ label: 'soe', query: 'error', enabled: true, _savedQuery: 'error' }])
    expect(screen.getByDisplayValue('soe')).toBeInTheDocument()
    expect(screen.getByDisplayValue('error')).toBeInTheDocument()
  })
  it('추가 버튼이 새 행을 append한다', () => {
    const { onChange } = setup([])
    fireEvent.click(screen.getByText('+ 로그 쿼리 추가'))
    expect(onChange).toHaveBeenCalledWith([{ label: '', query: '', enabled: true }])
  })
  it('삭제 버튼이 행을 제거한다', () => {
    const { onChange } = setup([{ label: 'soe', query: 'error', enabled: true }])
    fireEvent.click(screen.getByLabelText('삭제'))
    expect(onChange).toHaveBeenCalledWith([])
  })
  it('필드 수정 시 onChange로 갱신', () => {
    const { onChange } = setup([{ label: 'soe', query: 'error', enabled: true }])
    fireEvent.change(screen.getByDisplayValue('soe'), { target: { value: 'soe2' } })
    expect(onChange).toHaveBeenCalledWith([{ label: 'soe2', query: 'error', enabled: true }])
  })
  it('테스트 버튼 클릭 시 onTest 호출 후 통과 상태 반영', async () => {
    const onTest = vi.fn().mockResolvedValue({ ok: true })
    const { onChange } = setup([{ label: 'soe', query: 'error', enabled: true }], { onTest })
    fireEvent.click(screen.getByText('테스트'))
    await waitFor(() => expect(onTest).toHaveBeenCalledWith('error'))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ label: 'soe', query: 'error', _test: 'passed', _testedQuery: 'error' }),
    ]))
  })
})
