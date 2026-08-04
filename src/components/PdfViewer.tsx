import { useEffect, useRef, useState } from 'react'
import type * as pdfjsLib from 'pdfjs-dist'
import {
  renderPageToCanvas,
  getPageTextItems,
  type PageTextItem,
} from '../lib/pdfEngine'

interface PdfViewerProps {
  pdfjsDoc: pdfjsLib.PDFDocumentProxy | null
  pageNumber: number
  addTextMode: boolean
  editTextMode: boolean
  onAddText: (x: number, y: number, text: string) => void
  onReplaceText: (item: PageTextItem, newText: string) => void
}

const SCALE = 1.3

interface PendingEdit {
  overlayX: number
  overlayY: number
  pdfX: number
  pdfY: number
  replaceItem: PageTextItem | null
}

export default function PdfViewer({
  pdfjsDoc,
  pageNumber,
  addTextMode,
  editTextMode,
  onAddText,
  onReplaceText,
}: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingEdit | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [textItems, setTextItems] = useState<PageTextItem[]>([])
  const [pageHeight, setPageHeight] = useState(0)

  useEffect(() => {
    if (!pdfjsDoc || !canvasRef.current) return
    setError(null)
    let cancelled = false
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null

    renderPageToCanvas(pdfjsDoc, pageNumber, canvasRef.current, SCALE)
      .then((task) => {
        if (cancelled) {
          task.cancel()
          return
        }
        renderTask = task
        return task.promise
      })
      .catch((err) => {
        if (err instanceof Error && err.name === 'RenderingCancelledException') return
        setError(err instanceof Error ? err.message : 'Error al renderizar la página')
      })

    return () => {
      cancelled = true
      renderTask?.cancel()
    }
  }, [pdfjsDoc, pageNumber])

  useEffect(() => {
    if (!pdfjsDoc) {
      setTextItems([])
      setPageHeight(0)
      return
    }
    let cancelled = false
    getPageTextItems(pdfjsDoc, pageNumber)
      .then(({ items, pageHeight }) => {
        if (cancelled) return
        setTextItems(items)
        setPageHeight(pageHeight)
      })
      .catch(() => {
        if (!cancelled) setTextItems([])
      })
    return () => {
      cancelled = true
    }
  }, [pdfjsDoc, pageNumber])

  useEffect(() => {
    setPending(null)
    setInputValue('')
  }, [pageNumber, addTextMode, editTextMode])

  function handleClick(event: React.MouseEvent<HTMLCanvasElement>) {
    if (!canvasRef.current || !containerRef.current) return
    if (!addTextMode && !editTextMode) return

    const canvas = canvasRef.current
    const canvasRect = canvas.getBoundingClientRect()
    const containerRect = containerRef.current.getBoundingClientRect()
    const scaleX = canvas.width / canvasRect.width
    const scaleY = canvas.height / canvasRect.height
    const clickTopX = ((event.clientX - canvasRect.left) * scaleX) / SCALE
    const clickTopY = ((event.clientY - canvasRect.top) * scaleY) / SCALE

    if (editTextMode) {
      const clickBottomY = pageHeight - clickTopY
      const hit = textItems.find(
        (item) =>
          clickTopX >= item.x &&
          clickTopX <= item.x + item.width &&
          clickBottomY >= item.y - item.height * 0.3 &&
          clickBottomY <= item.y + item.height,
      )
      if (!hit) return
      setPending({
        overlayX: hit.x * SCALE,
        overlayY: (pageHeight - hit.y - hit.height) * SCALE,
        pdfX: 0,
        pdfY: 0,
        replaceItem: hit,
      })
      setInputValue(hit.str)
      return
    }

    setPending({
      overlayX: event.clientX - containerRect.left,
      overlayY: event.clientY - containerRect.top,
      pdfX: clickTopX,
      pdfY: clickTopY,
      replaceItem: null,
    })
    setInputValue('')
  }

  function confirmPending() {
    if (!pending) return
    const text = inputValue.trim()
    if (text) {
      if (pending.replaceItem) {
        onReplaceText(pending.replaceItem, text)
      } else {
        onAddText(pending.pdfX, pending.pdfY, text)
      }
    }
    setPending(null)
    setInputValue('')
  }

  function cancelPending() {
    setPending(null)
    setInputValue('')
  }

  if (!pdfjsDoc) {
    return <div className="pdf-viewer-empty">Abre un PDF para comenzar</div>
  }

  return (
    <div className="pdf-viewer">
      {error && <p className="error">{error}</p>}
      <div className="pdf-page-container" ref={containerRef}>
        <canvas
          ref={canvasRef}
          onClick={handleClick}
          className={addTextMode || editTextMode ? 'canvas-add-text' : ''}
        />
        {pending && (
          <div
            className="text-input-overlay"
            style={{ left: pending.overlayX, top: pending.overlayY }}
          >
            <input
              autoFocus
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') confirmPending()
                if (event.key === 'Escape') cancelPending()
              }}
              placeholder="Texto..."
            />
            <button onClick={confirmPending} aria-label="Confirmar">
              ✓
            </button>
            <button onClick={cancelPending} aria-label="Cancelar">
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
