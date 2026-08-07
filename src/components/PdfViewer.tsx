import { useEffect, useRef, useState } from 'react'
import type * as pdfjsLib from 'pdfjs-dist'
import {
  renderPageToCanvas,
  getPageTextItems,
  getPageImageItems,
  type PageTextItem,
  type PageImageItem,
} from '../lib/pdfEngine'

type ImageMimeType = 'image/png' | 'image/jpeg'

interface PdfViewerProps {
  pdfjsDoc: pdfjsLib.PDFDocumentProxy | null
  pageNumber: number
  addTextMode: boolean
  editTextMode: boolean
  addImageMode: boolean
  editImageMode: boolean
  onAddText: (x: number, y: number, text: string) => void
  onReplaceText: (item: PageTextItem, newText: string) => void
  onAddImage: (
    x: number,
    y: number,
    bytes: Uint8Array,
    mimeType: ImageMimeType,
    naturalWidth: number,
    naturalHeight: number,
  ) => void
  onReplaceImage: (
    item: PageImageItem,
    bytes: Uint8Array,
    mimeType: ImageMimeType,
  ) => void
}

const MIN_SCALE = 0.4
const MAX_SCALE = 3
const VIEWER_PADDING = 32

interface PendingEdit {
  overlayX: number
  overlayY: number
  pdfX: number
  pdfY: number
  replaceItem: PageTextItem | null
}

type PendingImageAction =
  | { type: 'add'; x: number; y: number }
  | { type: 'replace'; item: PageImageItem }

function readImageFile(file: File): Promise<{
  bytes: Uint8Array
  width: number
  height: number
}> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      file
        .arrayBuffer()
        .then((buffer) => {
          resolve({
            bytes: new Uint8Array(buffer),
            width: img.naturalWidth,
            height: img.naturalHeight,
          })
          URL.revokeObjectURL(url)
        })
        .catch(reject)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('No se pudo leer la imagen'))
    }
    img.src = url
  })
}

export default function PdfViewer({
  pdfjsDoc,
  pageNumber,
  addTextMode,
  editTextMode,
  addImageMode,
  editImageMode,
  onAddText,
  onReplaceText,
  onAddImage,
  onReplaceImage,
}: PdfViewerProps) {
  const viewerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const pendingImageActionRef = useRef<PendingImageAction | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingEdit | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [textItems, setTextItems] = useState<PageTextItem[]>([])
  const [imageItems, setImageItems] = useState<PageImageItem[]>([])
  const [pageHeight, setPageHeight] = useState(0)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    if (!pdfjsDoc || !viewerRef.current) return
    let cancelled = false
    const viewer = viewerRef.current

    async function updateScale() {
      if (!pdfjsDoc) return
      try {
        const page = await pdfjsDoc.getPage(pageNumber)
        if (cancelled) return
        const naturalWidth = page.getViewport({ scale: 1 }).width
        const available = viewer.clientWidth - VIEWER_PADDING
        const next = Math.min(
          MAX_SCALE,
          Math.max(MIN_SCALE, available / naturalWidth),
        )
        setScale(next)
      } catch {
        // ignore; render effect will surface a real error if the page fails to load
      }
    }

    updateScale()
    const observer = new ResizeObserver(() => updateScale())
    observer.observe(viewer)
    return () => {
      cancelled = true
      observer.disconnect()
    }
  }, [pdfjsDoc, pageNumber])

  useEffect(() => {
    if (!pdfjsDoc || !canvasRef.current) return
    setError(null)
    let cancelled = false
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null

    renderPageToCanvas(pdfjsDoc, pageNumber, canvasRef.current, scale)
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
  }, [pdfjsDoc, pageNumber, scale])

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
    if (!pdfjsDoc) {
      setImageItems([])
      return
    }
    let cancelled = false
    getPageImageItems(pdfjsDoc, pageNumber)
      .then((items) => {
        if (!cancelled) setImageItems(items)
      })
      .catch(() => {
        if (!cancelled) setImageItems([])
      })
    return () => {
      cancelled = true
    }
  }, [pdfjsDoc, pageNumber])

  useEffect(() => {
    setPending(null)
    setInputValue('')
  }, [pageNumber, addTextMode, editTextMode, addImageMode, editImageMode])

  function handleClick(event: React.MouseEvent<HTMLCanvasElement>) {
    if (!canvasRef.current || !containerRef.current) return
    if (!addTextMode && !editTextMode && !addImageMode && !editImageMode) return

    const canvas = canvasRef.current
    const canvasRect = canvas.getBoundingClientRect()
    const containerRect = containerRef.current.getBoundingClientRect()
    const scaleX = canvas.width / canvasRect.width
    const scaleY = canvas.height / canvasRect.height
    const clickTopX = ((event.clientX - canvasRect.left) * scaleX) / scale
    const clickTopY = ((event.clientY - canvasRect.top) * scaleY) / scale

    if (addImageMode) {
      pendingImageActionRef.current = { type: 'add', x: clickTopX, y: clickTopY }
      imageInputRef.current?.click()
      return
    }

    if (editImageMode) {
      const clickBottomY = pageHeight - clickTopY
      const hit = imageItems.find(
        (item) =>
          clickTopX >= item.x &&
          clickTopX <= item.x + item.width &&
          clickBottomY >= item.y &&
          clickBottomY <= item.y + item.height,
      )
      if (!hit) return
      pendingImageActionRef.current = { type: 'replace', item: hit }
      imageInputRef.current?.click()
      return
    }

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
        overlayX: hit.x * scale,
        overlayY: (pageHeight - hit.y - hit.height) * scale,
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

  async function handleImageFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    const action = pendingImageActionRef.current
    pendingImageActionRef.current = null
    event.target.value = ''
    if (!file || !action) return

    if (file.type !== 'image/png' && file.type !== 'image/jpeg') {
      setError('Solo se admiten imágenes PNG o JPEG')
      return
    }

    try {
      const { bytes, width, height } = await readImageFile(file)
      const mimeType = file.type as ImageMimeType
      if (action.type === 'add') {
        onAddImage(action.x, action.y, bytes, mimeType, width, height)
      } else {
        onReplaceImage(action.item, bytes, mimeType)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al leer la imagen')
    }
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

  const clickModeActive = addTextMode || editTextMode || addImageMode || editImageMode

  if (!pdfjsDoc) {
    return <div className="pdf-viewer-empty">Abre un PDF para comenzar</div>
  }

  return (
    <div className="pdf-viewer" ref={viewerRef}>
      {error && <p className="error">{error}</p>}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg"
        onChange={handleImageFileChange}
        hidden
      />
      <div className="pdf-page-container" ref={containerRef}>
        <canvas
          ref={canvasRef}
          onClick={handleClick}
          className={clickModeActive ? 'canvas-add-text' : ''}
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
