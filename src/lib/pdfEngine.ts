import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

export interface TextAnnotation {
  pageIndex: number
  x: number
  y: number
  text: string
  size: number
}

export interface PageTextItem {
  str: string
  x: number
  y: number
  width: number
  height: number
}

export async function loadPdfDoc(bytes: ArrayBuffer) {
  return PDFDocument.load(bytes)
}

export async function loadPdfjsDoc(bytes: ArrayBuffer) {
  return pdfjsLib.getDocument({ data: bytes }).promise
}

export async function renderPageToCanvas(
  pdfjsDoc: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  scale: number,
) {
  const page = await pdfjsDoc.getPage(pageNumber)
  const viewport = page.getViewport({ scale })
  const context = canvas.getContext('2d')
  if (!context) throw new Error('No se pudo obtener el contexto 2D del canvas')

  canvas.width = viewport.width
  canvas.height = viewport.height

  return page.render({ canvasContext: context, viewport, canvas })
}

export async function extractText(pdfjsDoc: pdfjsLib.PDFDocumentProxy) {
  const pageTexts: string[] = []
  for (let i = 1; i <= pdfjsDoc.numPages; i++) {
    const page = await pdfjsDoc.getPage(i)
    const content = await page.getTextContent()
    const text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
    pageTexts.push(text)
  }
  return pageTexts.join('\n\n')
}

export async function getPageTextItems(
  pdfjsDoc: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
) {
  const page = await pdfjsDoc.getPage(pageNumber)
  const [content, viewport] = await Promise.all([
    page.getTextContent(),
    page.getViewport({ scale: 1 }),
  ])
  const items: PageTextItem[] = []
  for (const item of content.items) {
    if (!('str' in item) || !item.str.trim()) continue
    items.push({
      str: item.str,
      x: item.transform[4],
      y: item.transform[5],
      width: item.width,
      height: item.height,
    })
  }
  return { items, pageHeight: viewport.height }
}

export async function replaceTextAtItem(
  doc: PDFDocument,
  pageIndex: number,
  item: PageTextItem,
  newText: string,
) {
  const page = doc.getPages()[pageIndex]
  if (!page) return
  const font = await doc.embedFont(StandardFonts.Helvetica)

  page.drawRectangle({
    x: item.x - 1,
    y: item.y - item.height * 0.25,
    width: item.width + 2,
    height: item.height * 1.15,
    color: rgb(1, 1, 1),
  })
  page.drawText(newText, {
    x: item.x,
    y: item.y,
    size: item.height,
    font,
    color: rgb(0, 0, 0),
  })
}

export function deletePage(doc: PDFDocument, pageIndex: number) {
  doc.removePage(pageIndex)
}

export function movePage(doc: PDFDocument, fromIndex: number, toIndex: number) {
  const pageCount = doc.getPageCount()
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    fromIndex >= pageCount ||
    toIndex < 0 ||
    toIndex >= pageCount
  ) {
    return
  }
  const page = doc.getPage(fromIndex)
  doc.removePage(fromIndex)
  doc.insertPage(toIndex, page)
}

export async function addTextAnnotations(
  doc: PDFDocument,
  annotations: TextAnnotation[],
) {
  if (annotations.length === 0) return
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const pages = doc.getPages()

  for (const annotation of annotations) {
    const page = pages[annotation.pageIndex]
    if (!page) continue
    const { height } = page.getSize()
    page.drawText(annotation.text, {
      x: annotation.x,
      y: height - annotation.y,
      size: annotation.size,
      font,
      color: rgb(0, 0, 0),
    })
  }
}

export async function saveDoc(doc: PDFDocument) {
  return doc.save()
}

export function downloadBytes(bytes: Uint8Array, filename: string, mime: string) {
  const blob = new Blob([new Uint8Array(bytes)], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
