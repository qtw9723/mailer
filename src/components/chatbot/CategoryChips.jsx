import { useState } from 'react'
import { Plus, Pencil, X, Check } from 'lucide-react'

// 카테고리 필터 칩 바 + 추가/이름변경/삭제(관리 모드)
// props:
//  categories: string[] · hasUncat: bool · activeCat: null|string|uncatValue · uncatValue
//  onSelect(val) · onAdd(name)->Promise · onRename(from,to)->Promise · onRequestDelete(name)
export default function CategoryChips({
  categories, hasUncat, activeCat, uncatValue,
  onSelect, onAdd, onRename, onRequestDelete,
}) {
  const [adding, setAdding] = useState(false)
  const [newCat, setNewCat] = useState('')
  const [manage, setManage] = useState(false)
  const [renaming, setRenaming] = useState(null)
  const [renameVal, setRenameVal] = useState('')

  const submitAdd = async (e) => {
    e.preventDefault()
    await onAdd(newCat)
    setNewCat(''); setAdding(false)
  }

  const startRename = (c) => { setRenaming(c); setRenameVal(c) }
  const submitRename = async (e) => {
    e.preventDefault()
    await onRename(renaming, renameVal)
    setRenaming(null); setRenameVal('')
  }

  if (manage) {
    return (
      <div className="cat-chips">
        {categories.map(c => (
          renaming === c ? (
            <form key={c} className="cat-chip-add" onSubmit={submitRename}>
              <input
                className="cat-chip-input" value={renameVal} autoFocus
                onChange={e => setRenameVal(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') { setRenaming(null); setRenameVal('') } }}
                aria-label={`${c} 이름 변경`}
              />
              <button type="submit" className="cat-chip cat-chip-icon" aria-label="확인"><Check size={13} /></button>
            </form>
          ) : (
            <span key={c} className="cat-chip cat-chip-edit">
              <button type="button" className="cat-chip-name" onClick={() => startRename(c)} title="이름 변경">{c}</button>
              <button type="button" className="cat-chip-x" onClick={() => onRequestDelete(c)} aria-label={`${c} 삭제`}><X size={12} /></button>
            </span>
          )
        ))}
        {categories.length === 0 && <span className="cat-chip-empty">추가된 카테고리가 없습니다</span>}
        <button type="button" className="cat-chip cat-chip-done" onClick={() => { setManage(false); setRenaming(null) }}>완료</button>
      </div>
    )
  }

  return (
    <div className="cat-chips">
      <button type="button" className={`cat-chip${activeCat == null ? ' active' : ''}`} onClick={() => onSelect(null)}>전체</button>
      {categories.map(c => (
        <button type="button" key={c} className={`cat-chip${activeCat === c ? ' active' : ''}`} onClick={() => onSelect(c)}>{c}</button>
      ))}
      {hasUncat && (
        <button type="button" className={`cat-chip${activeCat === uncatValue ? ' active' : ''}`} onClick={() => onSelect(uncatValue)}>미분류</button>
      )}
      {adding ? (
        <form className="cat-chip-add" onSubmit={submitAdd}>
          <input
            className="cat-chip-input" value={newCat} autoFocus
            onChange={e => setNewCat(e.target.value)}
            onBlur={() => { setNewCat(''); setAdding(false) }}
            placeholder="새 카테고리" aria-label="새 카테고리 이름"
          />
        </form>
      ) : (
        <button type="button" className="cat-chip cat-chip-icon" onClick={() => setAdding(true)} aria-label="카테고리 추가" title="카테고리 추가">
          <Plus size={13} />
        </button>
      )}
      {categories.length > 0 && (
        <button type="button" className="cat-chip cat-chip-icon" onClick={() => setManage(true)} aria-label="카테고리 관리" title="카테고리 이름변경·삭제">
          <Pencil size={12} />
        </button>
      )}
    </div>
  )
}
