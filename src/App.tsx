import { useEffect, useState } from 'react'
import type * as pdfjsLib from 'pdfjs-dist'
import Toolbar from './components/Toolbar'
import PdfViewer from './components/PdfViewer'
import TextPanel from './components/TextPanel'
import {
  loadPdfDoc,
  loadPdfjsDoc,
  deletePage,
  movePage,
  addTextAnnotations,
  replaceTextAtItem,
  saveDoc,
  extractText,
  downloadBytes,
  type PageTextItem,
} from './lib/pdfEngine'
import './App.css'

function App() {
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null)
  const [pdfjsDoc, setPdfjsDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
  const [pageCount, setPageCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [addTextMode, setAddTextMode] = useState(false)
  const [editTextMode, setEditTextMode] = useState(false)
  const [extractedText, setExtractedText] = useState('')
  const [fileName, setFileName] = useState('documento.pdf')
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!pdfBytes) {
      setPdfjsDoc(null)
      setPageCount(0)
      return
    }
    let cancelled = false
    loadPdfjsDoc(pdfBytes.slice().buffer as ArrayBuffer)
      .then((doc) => {
        if (cancelled) return
        setPdfjsDoc(doc)
        setPageCount(doc.numPages)
        setCurrentPage((page) => Math.min(Math.max(page, 1), doc.numPages))
      })
      .catch((err) => {
        if (cancelled) return
        setErrorMessage(err instanceof Error ? err.message : 'Error al abrir el PDF')
      })
    return () => {
      cancelled = true
    }
  }, [pdfBytes])

  async function handleOpenFile(file: File) {
    setErrorMessage(null)
    setBusy(true)
    try {
      const buffer = await file.arrayBuffer()
      setPdfBytes(new Uint8Array(buffer))
      setFileName(file.name)
      setExtractedText('')
      setCurrentPage(1)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Error al leer el archivo')
    } finally {
      setBusy(false)
    }
  }

  async function withPdfLibDoc(mutate: (doc: Awaited<ReturnType<typeof loadPdfDoc>>) => void | Promise<void>) {
    if (!pdfBytes) return
    setBusy(true)
    setErrorMessage(null)
    try {
      const doc = await loadPdfDoc(pdfBytes.slice().buffer as ArrayBuffer)
      await mutate(doc)
      const newBytes = await saveDoc(doc)
      setPdfBytes(newBytes)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Error al editar el PDF')
    } finally {
      setBusy(false)
    }
  }

  function handleDeletePage() {
    const pageIndex = currentPage - 1
    withPdfLibDoc((doc) => {
      deletePage(doc, pageIndex)
    }).then(() => {
      setCurrentPage((page) => Math.max(1, Math.min(page, pageCount - 1)))
    })
  }

  function handleMovePage(direction: -1 | 1) {
    const fromIndex = currentPage - 1
    const toIndex = fromIndex + direction
    withPdfLibDoc((doc) => {
      movePage(doc, fromIndex, toIndex)
    }).then(() => {
      setCurrentPage((page) => page + direction)
    })
  }

  function handleAddText(x: number, y: number, text: string) {
    withPdfLibDoc((doc) => {
      addTextAnnotations(doc, [
        { pageIndex: currentPage - 1, x, y, text, size: 14 },
      ])
    })
  }

  function handleReplaceText(item: PageTextItem, newText: string) {
    withPdfLibDoc((doc) => {
      replaceTextAtItem(doc, currentPage - 1, item, newText)
    })
  }

  function handleSave() {
    if (!pdfBytes) return
    downloadBytes(pdfBytes.slice(), fileName, 'application/pdf')
  }

  async function handleExtractText() {
    if (!pdfjsDoc) return
    setBusy(true)
    setErrorMessage(null)
    try {
      const text = await extractText(pdfjsDoc)
      setExtractedText(text)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Error al extraer el texto')
    } finally {
      setBusy(false)
    }
  }

  function handleExportText() {
    const bytes = new TextEncoder().encode(extractedText)
    const exportName = fileName.replace(/\.pdf$/i, '') + '.txt'
    downloadBytes(bytes, exportName, 'text/plain')
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Editor de PDF</h1>
        <span className="file-name">{pdfBytes ? fileName : 'Sin archivo abierto'}</span>
      </header>

      <Toolbar
        onOpenFile={handleOpenFile}
        onSave={handleSave}
        onDeletePage={handleDeletePage}
        onMovePage={handleMovePage}
        addTextMode={addTextMode}
        onToggleAddText={() => {
          setAddTextMode((mode) => !mode)
          setEditTextMode(false)
        }}
        editTextMode={editTextMode}
        onToggleEditText={() => {
          setEditTextMode((mode) => !mode)
          setAddTextMode(false)
        }}
        currentPage={currentPage}
        pageCount={pageCount}
        onPrevPage={() => setCurrentPage((page) => Math.max(1, page - 1))}
        onNextPage={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}
        onExtractText={handleExtractText}
        disabled={busy || !pdfBytes}
      />

      {errorMessage && <p className="error banner">{errorMessage}</p>}
      {busy && <p className="status banner">Procesando...</p>}

      <main className="app-main">
        <PdfViewer
          pdfjsDoc={pdfjsDoc}
          pageNumber={currentPage}
          addTextMode={addTextMode}
          editTextMode={editTextMode}
          onAddText={handleAddText}
          onReplaceText={handleReplaceText}
        />
        <TextPanel
          text={extractedText}
          onChange={setExtractedText}
          onExport={handleExportText}
        />
      </main>
    </div>
  )
}

export default App
