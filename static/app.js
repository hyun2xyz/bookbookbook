const form = document.querySelector("[data-form]");
const fileInput = document.querySelector("[data-file]");
const dropZone = document.querySelector("[data-drop-zone]");
const fileName = document.querySelector("[data-file-name]");
const submitButton = document.querySelector("[data-submit]");
const statusBox = document.querySelector("[data-status]");
const resultBox = document.querySelector("[data-result]");
const previewEmpty = document.querySelector("[data-preview-empty]");
const previewName = document.querySelector("[data-preview-name]");
const previewImage = document.querySelector("[data-preview-image]");
const pageNav = document.querySelector("[data-page-nav]");

const API_BASE = window.location.protocol === "file:" ? "http://127.0.0.1:8765" : "";
let previewRequestId = 0;
let previewState = null;

async function setFile(file) {
  if (!file) return;
  if (file.type && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    statusBox.textContent = "PDF 파일만 선택할 수 있습니다.";
    return;
  }

  const requestId = ++previewRequestId;
  const transfer = new DataTransfer();
  transfer.items.add(file);
  fileInput.files = transfer.files;
  fileName.textContent = file.name;
  previewName.textContent = file.name;
  resultBox.hidden = true;
  statusBox.textContent = "미리보기를 준비 중입니다.";
  previewState = null;
  pageNav.hidden = true;
  pageNav.innerHTML = "";
  previewImage.hidden = true;
  previewImage.removeAttribute("src");
  previewEmpty.hidden = false;
  previewEmpty.textContent = "PDF를 불러오는 중입니다.";

  try {
    const body = new FormData();
    body.append("pdf", file);
    const response = await fetch(`${API_BASE}/inspect`, { method: "POST", body });
    const payload = await response.json();

    if (!payload.ok) {
      throw new Error(payload.error || "미리보기를 만들 수 없습니다.");
    }

    if (requestId !== previewRequestId) return;

    previewState = {
      id: payload.previewId,
      pageCount: payload.pageCount,
      currentPage: 1,
    };

    renderPageNav();
    showPreviewPage(1);
    statusBox.textContent = "";
  } catch (error) {
    previewEmpty.textContent = formatFetchError(error, "미리보기를 만들 수 없습니다.");
    statusBox.textContent = previewEmpty.textContent;
  }
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
  void setFile(event.dataTransfer.files[0]);
});

fileInput.addEventListener("change", () => {
  void setFile(fileInput.files[0]);
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
    const response = await fetch(`${API_BASE}/convert`, { method: "POST", body });
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
      <a class="download" href="${API_BASE}${payload.downloadUrl}" target="_blank" rel="noreferrer">PDF 열기</a>
    `;
    statusBox.textContent = "변환이 끝났습니다.";
  } catch (error) {
    statusBox.textContent = formatFetchError(error, "변환에 실패했습니다.");
  } finally {
    submitButton.disabled = false;
  }
});

function renderPageNav() {
  if (!previewState) return;

  pageNav.innerHTML = "";
  for (let page = 1; page <= previewState.pageCount; page += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = String(page);
    button.className = "page-nav-button";
    button.setAttribute("aria-label", `${page}페이지 보기`);
    button.addEventListener("click", () => showPreviewPage(page));
    pageNav.append(button);
  }
  pageNav.hidden = false;
}

function showPreviewPage(page) {
  if (!previewState) return;

  previewState.currentPage = page;
  previewName.textContent = `${fileInput.files[0].name} · ${page}/${previewState.pageCount}페이지`;
  previewImage.src = `${API_BASE}/previews/${previewState.id}/${page}.png`;
  previewImage.hidden = false;
  previewEmpty.hidden = true;

  for (const button of pageNav.querySelectorAll("button")) {
    button.classList.toggle("is-active", button.textContent === String(page));
  }
}

function formatFetchError(error, fallback) {
  if (error instanceof TypeError && error.message === "Failed to fetch") {
    return "로컬 서버 연결에 실패했습니다. http://127.0.0.1:8765 주소로 열었는지 확인해주세요.";
  }

  return error.message || fallback;
}
