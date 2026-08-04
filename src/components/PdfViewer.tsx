import { useEffect, useRef, useState } from 'react'
import type * as pdfjsLib from 'pdfjs-dist'
import { renderPageToCanvas } from '../lib/pdfEngine'

interface PdfViewerProps {
  pdfjsDoc: pdfjsLib.PDFDocumentProxy | null
  pageNumber: number
  addTextMode: boolean
  onAddText: (x: number, y: number, text: string) => void
}

const SCALE = 1.3

interface PendingPoint {
  overlayX: number
  overlayY: number
  pdfX: number
  pdfY: number
}

export default function PdfViewer({
  pdfjsDoc,
  pageNumber,
  addTextMode,
  onAddText,
}: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingPoint | null>(null)
  const [inputValue, setInputValue] = useState('')

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
    setPending(null)
    setInputValue('')
  }, [pageNumber, addTextMode])

  function handleClick(event: React.MouseEvent<HTMLCanvasElement>) {
    if (!addTextMode || !canvasRef.current || !containerRef.current) return
    const canvas = canvasRef.current
    const canvasRect = canvas.getBoundingClientRect()
    const containerRect = containerRef.current.getBoundingClientRect()
    const scaleX = canvas.width / canvasRect.width
    const scaleY = canvas.height / canvasRect.height
    const pdfX = ((event.clientX - canvasRect.left) * scaleX) / SCALE
    const pdfY = ((event.clientY - canvasRect.top) * scaleY) / SCALE
    setPending({
      overlayX: event.clientX - containerRect.left,
      overlayY: event.clientY - containerRect.top,
      pdfX,
      pdfY,
    })
    setInputValue('')
  }

  function confirmPending() {
    if (!pending) return
    const text = inputValue.trim()
    if (text) {
      onAddText(pending.pdfX, pending.pdfY, text)
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
          className={addTextMode ? 'canvas-add-text' : ''}
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
