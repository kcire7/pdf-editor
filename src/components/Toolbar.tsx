interface ToolbarProps {
  onOpenFile: (file: File) => void
  onSave: () => void
  onUndo: () => void
  canUndo: boolean
  onDeletePage: () => void
  onMovePage: (direction: -1 | 1) => void
  addTextMode: boolean
  onToggleAddText: () => void
  editTextMode: boolean
  onToggleEditText: () => void
  currentPage: number
  pageCount: number
  onPrevPage: () => void
  onNextPage: () => void
  onExtractText: () => void
  disabled: boolean
}

export default function Toolbar({
  onOpenFile,
  onSave,
  onUndo,
  canUndo,
  onDeletePage,
  onMovePage,
  addTextMode,
  onToggleAddText,
  editTextMode,
  onToggleEditText,
  currentPage,
  pageCount,
  onPrevPage,
  onNextPage,
  onExtractText,
  disabled,
}: ToolbarProps) {
  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) onOpenFile(file)
    event.target.value = ''
  }

  return (
    <div className="toolbar">
      <label className="file-input-label">
        Abrir PDF
        <input type="file" accept="application/pdf" onChange={handleFileChange} hidden />
      </label>
      <button onClick={onSave} disabled={disabled}>
        Guardar PDF
      </button>
      <button onClick={onUndo} disabled={disabled || !canUndo}>
        Deshacer
      </button>
      <button onClick={onExtractText} disabled={disabled}>
        Extraer texto
      </button>

      <span className="divider" />

      <button onClick={onPrevPage} disabled={disabled || currentPage <= 1}>
        ◀
      </button>
      <span className="page-indicator">
        Página {pageCount ? currentPage : 0} / {pageCount}
      </span>
      <button onClick={onNextPage} disabled={disabled || currentPage >= pageCount}>
        ▶
      </button>

      <span className="divider" />

      <button onClick={() => onMovePage(-1)} disabled={disabled || currentPage <= 1}>
        Mover ↑
      </button>
      <button onClick={() => onMovePage(1)} disabled={disabled || currentPage >= pageCount}>
        Mover ↓
      </button>
      <button onClick={onDeletePage} disabled={disabled || pageCount === 0}>
        Eliminar página
      </button>

      <span className="divider" />

      <button
        className={addTextMode ? 'active' : ''}
        onClick={onToggleAddText}
        disabled={disabled}
      >
        {addTextMode ? 'Modo texto: ON' : 'Agregar texto'}
      </button>
      <button
        className={editTextMode ? 'active' : ''}
        onClick={onToggleEditText}
        disabled={disabled}
      >
        {editTextMode ? 'Modo editar: ON' : 'Editar texto'}
      </button>
    </div>
  )
}
