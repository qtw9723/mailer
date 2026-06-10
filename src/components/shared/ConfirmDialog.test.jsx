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
