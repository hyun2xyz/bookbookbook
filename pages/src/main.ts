import "./styles.css";

import { convertPdfToBooklet } from "./pdf-engine";
import { type PreviewDocument, loadPreviewDocument } from "./preview";

const form = getElement<HTMLFormElement>("[data-form]");
const fileInput = getElement<HTMLInputElement>("[data-file]");
const dropZone = getElement<HTMLButtonElement>("[data-drop-zone]");
const fileName = getElement<HTMLElement>("[data-file-name]");
const submitButton = getElement<HTMLButtonElement>("[data-submit]");
const statusBox = getElement<HTMLElement>("[data-status]");
const resultBox = getElement<HTMLElement>("[data-result]");
const previewEmpty = getElement<HTMLElement>("[data-preview-empty]");
const previewName = getElement<HTMLElement>("[data-preview-name]");
const previewCanvas = getElement<HTMLCanvasElement>("[data-preview-canvas]");
const pageIndicator = getElement<HTMLElement>("[data-page-indicator]");
const previewFrame = getElement<HTMLElement>("[data-preview-frame]");

let previewRequestId = 0;
let previewState: { document: PreviewDocument; currentPage: number } | null = null;
let selectedPdfBytes: Uint8Array | null = null;
let downloadUrl: string | null = null;

dropZone.addEventListener("click", () => fileInput.click());

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("is-dragging");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("is-dragging");
});

dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("is-dragging");
  void setFile(event.dataTransfer?.files[0] ?? null);
});

fileInput.addEventListener("change", () => {
  void setFile(fileInput.files?.[0] ?? null);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!fileInput.files?.[0] || !selectedPdfBytes) {
    statusBox.textContent = "PDF 파일을 먼저 선택하세요.";
    return;
  }

  submitButton.disabled = true;
  statusBox.textContent = "브라우저 안에서 변환 중입니다.";
  resultBox.hidden = true;

  try {
    revokeDownloadUrl();
    const formData = new FormData(form);
    const binding = formData.get("binding") === "right" ? "right" : "left";
    const result = await convertPdfToBooklet(selectedPdfBytes, { binding });
    const outputBuffer = new ArrayBuffer(result.bytes.byteLength);
    new Uint8Array(outputBuffer).set(result.bytes);
    const blob = new Blob([outputBuffer], { type: "application/pdf" });
    const sourceName = fileInput.files[0].name || "bookbookbook.pdf";
    const outputName = `${sourceName.replace(/\.pdf$/i, "")}_booklet.pdf`;
    downloadUrl = URL.createObjectURL(blob);

    resultBox.hidden = false;
    resultBox.innerHTML = `
      <div class="result-grid">
        <span>원본 PDF 페이지</span><strong>${result.summary.originalPdfPages}</strong>
        <span>분리 후 책 쪽수</span><strong>${result.summary.readerPagesBeforePadding}</strong>
        <span>추가된 빈 페이지</span><strong>${result.summary.blankPagesAdded}</strong>
        <span>출력 인쇄면</span><strong>${result.summary.printerSpreads}</strong>
      </div>
      <a class="download" href="${downloadUrl}" download="${escapeAttribute(outputName)}">PDF 다운로드</a>
    `;
    statusBox.textContent = "변환이 끝났습니다.";
  } catch (error) {
    statusBox.textContent = formatError(error, "변환에 실패했습니다.");
  } finally {
    submitButton.disabled = false;
  }
});

previewFrame.addEventListener("click", (event) => {
  if (!previewState) return;

  const bounds = previewFrame.getBoundingClientRect();
  const clickX = event.clientX - bounds.left;
  void showPreviewPage(clickX < bounds.width / 2 ? previewState.currentPage - 1 : previewState.currentPage + 1);
});

previewFrame.addEventListener("keydown", (event) => {
  if (!previewState) return;

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    void showPreviewPage(previewState.currentPage - 1);
  }

  if (event.key === "ArrowRight") {
    event.preventDefault();
    void showPreviewPage(previewState.currentPage + 1);
  }
});

window.addEventListener("resize", () => {
  if (previewState) {
    void showPreviewPage(previewState.currentPage);
  }
});

async function setFile(file: File | null): Promise<void> {
  if (!file) return;

  if (file.type && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    statusBox.textContent = "PDF 파일만 선택할 수 있습니다.";
    return;
  }

  const requestId = ++previewRequestId;
  resetResult();
  await resetPreview();

  const transfer = new DataTransfer();
  transfer.items.add(file);
  fileInput.files = transfer.files;
  fileName.textContent = file.name;
  previewName.textContent = file.name;
  statusBox.textContent = "브라우저 안에서 미리보기를 준비 중입니다.";
  previewEmpty.hidden = false;
  previewEmpty.textContent = "PDF를 불러오는 중입니다.";

  try {
    selectedPdfBytes = new Uint8Array(await file.arrayBuffer());
    const document = await loadPreviewDocument(selectedPdfBytes);

    if (requestId !== previewRequestId) {
      await document.destroy();
      return;
    }

    previewState = { document, currentPage: 1 };
    await showPreviewPage(1);
    statusBox.textContent = "";
  } catch (error) {
    selectedPdfBytes = null;
    previewEmpty.textContent = formatError(error, "미리보기를 만들 수 없습니다.");
    statusBox.textContent = previewEmpty.textContent;
  }
}

async function showPreviewPage(page: number): Promise<void> {
  if (!previewState) return;

  const nextPage = Math.min(Math.max(page, 1), previewState.document.pageCount);
  previewState.currentPage = nextPage;
  previewName.textContent = fileInput.files?.[0]?.name ?? "선택된 PDF";
  pageIndicator.textContent = `${nextPage}/${previewState.document.pageCount}`;
  pageIndicator.hidden = false;
  previewCanvas.hidden = false;
  previewEmpty.hidden = true;

  await previewState.document.renderPage(nextPage, previewCanvas, previewFrame);
}

async function resetPreview(): Promise<void> {
  if (previewState) {
    await previewState.document.destroy();
  }

  previewState = null;
  pageIndicator.hidden = true;
  pageIndicator.textContent = "1/1";
  previewCanvas.hidden = true;
  previewCanvas.removeAttribute("width");
  previewCanvas.removeAttribute("height");
  previewCanvas.removeAttribute("style");
  previewEmpty.hidden = false;
  previewEmpty.textContent = "PDF를 선택하면 여기에 표시됩니다.";
}

function resetResult(): void {
  revokeDownloadUrl();
  selectedPdfBytes = null;
  resultBox.hidden = true;
  resultBox.innerHTML = "";
}

function revokeDownloadUrl(): void {
  if (downloadUrl) {
    URL.revokeObjectURL(downloadUrl);
    downloadUrl = null;
  }
}

function getElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing element: ${selector}`);
  }
  return element;
}

function formatError(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message || fallback;
  }
  return fallback;
}

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}
