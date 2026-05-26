import "./styles.css";

import { analyzePdfForBooklet, type BookletAnalysis, convertPdfToBooklet } from "./pdf-engine";
import type { BlankPlacement } from "./imposition";
import { type PreviewDocument, loadPreviewDocument } from "./preview";

const form = getElement<HTMLFormElement>("[data-form]");
const fileInput = getElement<HTMLInputElement>("[data-file]");
const dropZone = getElement<HTMLButtonElement>("[data-drop-zone]");
const submitButton = getElement<HTMLButtonElement>("[data-submit]");
const statusBox = getElement<HTMLElement>("[data-status]");
const resultBox = getElement<HTMLElement>("[data-result]");
const previewEmpty = getElement<HTMLElement>("[data-preview-empty]");
const previewEmptyMessage = getElement<HTMLElement>("[data-preview-empty-message]");
const previewName = getElement<HTMLElement>("[data-preview-name]");
const previewCanvas = getElement<HTMLCanvasElement>("[data-preview-canvas]");
const pageIndicator = getElement<HTMLElement>("[data-page-indicator]");
const pageNumberInput = getElement<HTMLInputElement>("[data-page-number]");
const pageTotal = getElement<HTMLElement>("[data-page-total]");
const previewFrame = getElement<HTMLElement>("[data-preview-frame]");
const analysisBox = getElement<HTMLElement>("[data-analysis]");
const blankPlacementBox = getElement<HTMLFieldSetElement>("[data-blank-placement]");
const blankPlacementNote = getElement<HTMLElement>("[data-blank-placement-note]");
const blankPageNumberInput = getElement<HTMLInputElement>("[data-blank-page-number]");

let previewRequestId = 0;
let previewRenderToken = 0;
let previewRenderQueue: Promise<void> = Promise.resolve();
let previewState: { document: PreviewDocument; currentPage: number } | null = null;
let selectedPdfBytes: Uint8Array | null = null;
let downloadUrl: string | null = null;

dropZone.addEventListener("click", (event) => {
  event.stopPropagation();
  fileInput.click();
});

fileInput.addEventListener("change", () => {
  void setFile(fileInput.files?.[0] ?? null);
});

blankPageNumberInput.addEventListener("focus", () => {
  const customPlacement = form.querySelector<HTMLInputElement>('input[name="blankPlacement"][value="before-page"]');
  if (customPlacement) {
    customPlacement.checked = true;
  }
});

pageNumberInput.addEventListener("change", () => {
  void showPreviewPageFromInput();
});

pageNumberInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    pageNumberInput.blur();
    void showPreviewPageFromInput();
  }
});

previewFrame.addEventListener("dragover", (event) => {
  event.preventDefault();
  previewFrame.classList.add("is-dragging");
});

previewFrame.addEventListener("dragleave", () => {
  previewFrame.classList.remove("is-dragging");
});

previewFrame.addEventListener("drop", (event) => {
  event.preventDefault();
  previewFrame.classList.remove("is-dragging");
  void setFile(event.dataTransfer?.files[0] ?? null);
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
    const blankPlacement = parseBlankPlacement(formData);
    const result = await convertPdfToBooklet(selectedPdfBytes, { binding, blankPlacement });
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
  if (!previewState) {
    fileInput.click();
    return;
  }

  const bounds = previewFrame.getBoundingClientRect();
  const clickX = event.clientX - bounds.left;
  void showPreviewPage(clickX < bounds.width / 2 ? previewState.currentPage - 1 : previewState.currentPage + 1);
});

previewFrame.addEventListener("keydown", (event) => {
  if (!previewState) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      fileInput.click();
    }
    return;
  }

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
  resetAnalysis();
  await resetPreview();

  const transfer = new DataTransfer();
  transfer.items.add(file);
  fileInput.files = transfer.files;
  previewName.textContent = file.name;
  statusBox.textContent = "브라우저 안에서 미리보기를 준비 중입니다.";
  previewEmpty.hidden = false;
  previewEmptyMessage.textContent = "PDF를 불러오는 중입니다.";

  try {
    selectedPdfBytes = new Uint8Array(await file.arrayBuffer());
    const [analysis, document] = await Promise.all([
      analyzePdfForBooklet(selectedPdfBytes),
      loadPreviewDocument(selectedPdfBytes),
    ]);

    if (requestId !== previewRequestId) {
      await document.destroy();
      return;
    }

    previewState = { document, currentPage: 1 };
    renderAnalysis(analysis);
    await showPreviewPage(1);
    statusBox.textContent = "";
  } catch (error) {
    selectedPdfBytes = null;
    resetAnalysis();
    previewEmptyMessage.textContent = formatError(error, "미리보기를 만들 수 없습니다.");
    statusBox.textContent = previewEmptyMessage.textContent;
  }
}

async function showPreviewPage(page: number): Promise<void> {
  if (!previewState) return;

  const nextPage = Math.min(Math.max(page, 1), previewState.document.pageCount);
  previewState.currentPage = nextPage;
  previewName.textContent = fileInput.files?.[0]?.name ?? "선택된 PDF";
  pageIndicator.hidden = false;
  pageNumberInput.max = String(previewState.document.pageCount);
  pageNumberInput.value = String(nextPage);
  pageTotal.textContent = String(previewState.document.pageCount);
  previewCanvas.hidden = false;
  previewEmpty.hidden = true;
  previewFrame.classList.remove("is-empty");

  const renderToken = ++previewRenderToken;
  const previousRender = previewRenderQueue.catch(() => {});
  const renderJob = previousRender.then(async () => {
    if (!previewState || renderToken !== previewRenderToken) return;

    await previewState.document.renderPage(nextPage, previewCanvas, previewFrame);
  });

  previewRenderQueue = renderJob;
  await renderJob;
}

async function resetPreview(): Promise<void> {
  previewRenderToken += 1;
  await previewRenderQueue.catch(() => {});

  if (previewState) {
    await previewState.document.destroy();
  }

  previewState = null;
  pageIndicator.hidden = true;
  pageNumberInput.value = "1";
  pageNumberInput.max = "1";
  pageTotal.textContent = "1";
  previewCanvas.hidden = true;
  previewCanvas.removeAttribute("width");
  previewCanvas.removeAttribute("height");
  previewCanvas.removeAttribute("style");
  previewEmpty.hidden = false;
  previewFrame.classList.add("is-empty");
  previewEmptyMessage.textContent = "드래그 엔 드롭 가능";
}

async function showPreviewPageFromInput(): Promise<void> {
  if (!previewState) return;

  const requestedPage = Number(pageNumberInput.value);
  if (!Number.isFinite(requestedPage)) {
    pageNumberInput.value = String(previewState.currentPage);
    return;
  }

  await showPreviewPage(requestedPage);
}

function resetResult(): void {
  revokeDownloadUrl();
  selectedPdfBytes = null;
  resultBox.hidden = true;
  resultBox.innerHTML = "";
}

function renderAnalysis(analysis: BookletAnalysis): void {
  analysisBox.hidden = false;
  analysisBox.innerHTML = `
    <div class="analysis-grid">
      <span>PDF 형태</span><strong>${describeDetectedShape(analysis.detectedPdfShape)}</strong>
      <span>원본 PDF 페이지</span><strong>${analysis.originalPdfPages}</strong>
      <span>분리 후 책 쪽수</span><strong>${analysis.readerPagesBeforePadding}</strong>
      <span>필요한 빈 페이지</span><strong>${analysis.blankPagesAdded}</strong>
      <span>출력 인쇄면</span><strong>${analysis.printerSpreads}</strong>
    </div>
  `;

  if (analysis.blankPagesAdded > 0) {
    blankPlacementBox.hidden = false;
    blankPlacementNote.textContent = `${analysis.blankPagesAdded}쪽의 빈 페이지가 필요합니다. 어디에 넣을지 고를 수 있습니다.`;
    blankPageNumberInput.max = String(analysis.readerPagesBeforePadding);
    blankPageNumberInput.value = String(Math.min(analysis.readerPagesBeforePadding, 2));
  } else {
    blankPlacementBox.hidden = true;
    blankPlacementNote.textContent = "";
  }
}

function resetAnalysis(): void {
  analysisBox.hidden = true;
  analysisBox.innerHTML = "";
  blankPlacementBox.hidden = true;
  blankPlacementNote.textContent = "";
  const defaultPlacement = form.querySelector<HTMLInputElement>('input[name="blankPlacement"][value="before-back-cover"]');
  if (defaultPlacement) {
    defaultPlacement.checked = true;
  }
  blankPageNumberInput.removeAttribute("max");
  blankPageNumberInput.value = "2";
}

function describeDetectedShape(shape: BookletAnalysis["detectedPdfShape"]): string {
  if (shape === "single-pages") {
    return "페이지 단위 PDF";
  }

  if (shape === "all-spreads") {
    return "스프레드 PDF";
  }

  return "페이지와 스프레드가 섞인 PDF";
}

function parseBlankPlacement(formData: FormData): BlankPlacement {
  const value = formData.get("blankPlacement");
  if (value === "after-front-cover" || value === "at-end") {
    return value;
  }

  if (value === "before-page") {
    const pageNumber = Number(formData.get("blankPageNumber"));
    const maxPageNumber = Number(blankPageNumberInput.max || "0");
    if (!Number.isFinite(pageNumber) || pageNumber < 1 || (maxPageNumber > 0 && pageNumber > maxPageNumber)) {
      throw new Error("빈 페이지를 넣을 쪽 번호를 확인하세요.");
    }
    return { type: "before-page", pageNumber };
  }

  return "before-back-cover";
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
