import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface PreviewDocument {
  pageCount: number;
  renderPage(pageNumber: number, canvas: HTMLCanvasElement, frame: HTMLElement): Promise<void>;
  destroy(): Promise<void>;
}

export async function loadPreviewDocument(bytes: Uint8Array): Promise<PreviewDocument> {
  const document = await getDocument({ data: bytes.slice() }).promise;
  return new PdfJsPreviewDocument(document);
}

class PdfJsPreviewDocument implements PreviewDocument {
  readonly pageCount: number;

  constructor(private readonly document: PDFDocumentProxy) {
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
  }

  async destroy(): Promise<void> {
    await this.document.destroy();
  }
}
