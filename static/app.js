const form = document.querySelector("[data-form]");
const fileInput = document.querySelector("[data-file]");
const dropZone = document.querySelector("[data-drop-zone]");
const fileName = document.querySelector("[data-file-name]");
const submitButton = document.querySelector("[data-submit]");
const statusBox = document.querySelector("[data-status]");
const resultBox = document.querySelector("[data-result]");
const previewFrame = document.querySelector("[data-preview]");
const previewEmpty = document.querySelector("[data-preview-empty]");
const previewName = document.querySelector("[data-preview-name]");

let previewUrl = null;

function setFile(file) {
  if (!file) return;
  if (file.type && file.type !== "application/pdf") {
    statusBox.textContent = "PDF 파일만 선택할 수 있습니다.";
    return;
  }

  const transfer = new DataTransfer();
  transfer.items.add(file);
  fileInput.files = transfer.files;
  fileName.textContent = file.name;
  previewName.textContent = file.name;
  resultBox.hidden = true;
  statusBox.textContent = "";

  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
  }

  previewUrl = URL.createObjectURL(file);
  previewFrame.src = previewUrl;
  previewFrame.hidden = false;
  previewEmpty.hidden = true;
}

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
  setFile(event.dataTransfer.files[0]);
});

fileInput.addEventListener("change", () => {
  setFile(fileInput.files[0]);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!fileInput.files[0]) {
    statusBox.textContent = "PDF 파일을 먼저 선택하세요.";
    return;
  }

  submitButton.disabled = true;
  statusBox.textContent = "변환 중입니다.";
  resultBox.hidden = true;

  try {
    const body = new FormData(form);
    const response = await fetch("/convert", { method: "POST", body });
    const payload = await response.json();

    if (!payload.ok) {
      throw new Error(payload.error || "변환에 실패했습니다.");
    }

    const summary = payload.summary;
    resultBox.hidden = false;
    resultBox.innerHTML = `
      <div class="result-grid">
        <span>원본 PDF 페이지</span><strong>${summary.original_pdf_pages}</strong>
        <span>분리 후 책 쪽수</span><strong>${summary.reader_pages_before_padding}</strong>
        <span>추가된 빈 페이지</span><strong>${summary.blank_pages_added}</strong>
        <span>출력 인쇄면</span><strong>${summary.printer_spreads}</strong>
      </div>
      <a class="download" href="${payload.downloadUrl}" target="_blank" rel="noreferrer">PDF 열기</a>
    `;
    statusBox.textContent = "변환이 끝났습니다.";
  } catch (error) {
    statusBox.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
});
