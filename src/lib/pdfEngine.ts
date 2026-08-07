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

export interface ImageAnnotation {
  pageIndex: number
  x: number
  y: number
  width: number
  height: number
  bytes: Uint8Array
  mimeType: 'image/png' | 'image/jpeg'
}

export interface PageImageItem {
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

export async function getPageImageItems(
  pdfjsDoc: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
) {
  const page = await pdfjsDoc.getPage(pageNumber)
  const opList = await page.getOperatorList()

  type Matrix = [number, number, number, number, number, number]
  const identity: Matrix = [1, 0, 0, 1, 0, 0]

  function multiply(m1: Matrix, m2: Matrix): Matrix {
    return [
      m1[0] * m2[0] + m1[1] * m2[2],
      m1[0] * m2[1] + m1[1] * m2[3],
      m1[2] * m2[0] + m1[3] * m2[2],
      m1[2] * m2[1] + m1[3] * m2[3],
      m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
      m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
    ]
  }

  const items: PageImageItem[] = []
  const stack: Matrix[] = []
  let ctm: Matrix = identity

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i]
    const args = opList.argsArray[i]
    if (fn === pdfjsLib.OPS.save) {
      stack.push(ctm)
    } else if (fn === pdfjsLib.OPS.restore) {
      ctm = stack.pop() ?? identity
    } else if (fn === pdfjsLib.OPS.transform) {
      ctm = multiply(args as Matrix, ctm)
    } else if (fn === pdfjsLib.OPS.paintImageXObject) {
      const width = Math.hypot(ctm[0], ctm[1])
      const height = Math.hypot(ctm[2], ctm[3])
      if (width > 1 && height > 1) {
        items.push({ x: ctm[4], y: ctm[5], width, height })
      }
    }
  }

  return items
}

async function embedImage(
  doc: PDFDocument,
  bytes: Uint8Array,
  mimeType: 'image/png' | 'image/jpeg',
) {
  return mimeType === 'image/png' ? doc.embedPng(bytes) : doc.embedJpg(bytes)
}

export async function addImageAnnotation(
  doc: PDFDocument,
  annotation: ImageAnnotation,
) {
  const page = doc.getPages()[annotation.pageIndex]
  if (!page) return
  const image = await embedImage(doc, annotation.bytes, annotation.mimeType)
  const { height: pageHeight } = page.getSize()
  page.drawImage(image, {
    x: annotation.x,
    y: pageHeight - annotation.y - annotation.height,
    width: annotation.width,
    height: annotation.height,
  })
}

export async function replaceImageAtItem(
  doc: PDFDocument,
  pageIndex: number,
  item: PageImageItem,
  bytes: Uint8Array,
  mimeType: 'image/png' | 'image/jpeg',
) {
  const page = doc.getPages()[pageIndex]
  if (!page) return
  const image = await embedImage(doc, bytes, mimeType)
  page.drawRectangle({
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height,
    color: rgb(1, 1, 1),
  })
  page.drawImage(image, {
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height,
  })
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
