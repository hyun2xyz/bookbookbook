import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";

import { analyzeReaderLayout, type PageSize } from "./imposition";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface PreviewDocument {
  pageCount: number;
  renderPage(pageNumber: number, canvas: HTMLCanvasElement, frame: HTMLElement): Promise<void>;
  destroy(): Promise<void>;
}

export async function loadPreviewDocument(bytes: Uint8Array): Promise<PreviewDocument> {
  const document = await getDocument({ data: bytes.slice() }).promise;

  try {
    const spreadPageNumbers = await getSpreadPageNumbers(document);
    return new PdfJsPreviewDocument(document, spreadPageNumbers);
  } catch (error) {
    await document.destroy();
    throw error;
  }
}

class PdfJsPreviewDocument implements PreviewDocument {
  readonly pageCount: number;

  constructor(
    private readonly document: PDFDocumentProxy,
    private readonly spreadPageNumbers: ReadonlySet<number>,
  ) {
    this.pageCount = document.numPages;
  }

  async renderPage(pageNumber: number, canvas: HTMLCanvasElement, frame: HTMLElement): Promise<void> {
    const page = await this.document.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const availableWidth = Math.max(frame.clientWidth - 32, 1);
    const availableHeight = Math.max(frame.clientHeight - 32, 1);
    const cssScale = Math.min(availableWidth / baseViewport.width, availableHeight / baseViewport.height);
    const deviceScale = window.devicePixelRatio || 1;
    const viewport = page.getViewport({ scale: cssScale * deviceScale });
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Canvas context is not available");
    }

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.style.width = `${Math.floor(viewport.width / deviceScale)}px`;
    canvas.style.height = `${Math.floor(viewport.height / deviceScale)}px`;

    await page.render({ canvas, canvasContext: context, viewport }).promise;
    drawPageBoundaries(context, canvas.width, canvas.height, this.spreadPageNumbers.has(pageNumber));
  }

  async destroy(): Promise<void> {
    await this.document.destroy();
  }
}

async function getSpreadPageNumbers(document: PDFDocumentProxy): Promise<ReadonlySet<number>> {
  const pageSizes: PageSize[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    pageSizes.push({ width: viewport.width, height: viewport.height });
  }

  const spreadPageNumbers = new Set<number>();
  const layout = analyzeReaderLayout(pageSizes);

  layout.slots.forEach((slot) => {
    if (slot.sourceIndex !== null && (slot.part === "left" || slot.part === "right")) {
      spreadPageNumbers.add(slot.sourceIndex + 1);
    }
  });

  return spreadPageNumbers;
}

function drawPageBoundaries(
  context: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  hasSpreadDivider: boolean,
): void {
  const lineWidth = Math.max(1, Math.round(window.devicePixelRatio || 1));
  const halfLine = lineWidth / 2;

  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.lineWidth = lineWidth;
  context.strokeStyle = "rgba(29, 29, 29, 0.22)";
  context.strokeRect(halfLine, halfLine, canvasWidth - lineWidth, canvasHeight - lineWidth);

  if (hasSpreadDivider) {
    const centerX = Math.round(canvasWidth / 2) + (lineWidth % 2 === 1 ? 0.5 : 0);
    context.beginPath();
    context.moveTo(centerX, halfLine);
    context.lineTo(centerX, canvasHeight - halfLine);
    context.stroke();
  }

  context.restore();
}
