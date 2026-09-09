import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import { PDFDocument, StandardFonts } from "pdf-lib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const readerFixturePath = resolve(__dirname, "reader-spreads-fixture.pdf");
const readerOutputPath = resolve(__dirname, "smoke-output-reader-spreads.pdf");
const readerNoPaperOutputPath = resolve(__dirname, "smoke-output-reader-no-paper.pdf");
const allSpreadFixturePath = resolve(__dirname, "all-spreads-fixture.pdf");
const allSpreadOutputPath = resolve(__dirname, "smoke-output-all-spreads.pdf");
const port = await getAvailablePort();
const expectedPaperOptions = ["선택 안 함", "A4", "A3", "A2", "A1", "A0", "B5", "B4", "B3", "B2", "B1", "B0", "Letter", "Tabloid", "커스텀"];
const expectedDuplexOptions = ["자동 (용지 방향 맞춤)", "긴 쪽 넘김", "짧은 쪽 넘김"];

await createReaderSpreadFixturePdf(readerFixturePath);
await createAllSpreadFixturePdf(allSpreadFixturePath);

const server = spawn("npx", ["vite", "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
});

try {
  await waitForServer(`http://127.0.0.1:${port}/`);

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const pageErrors = [];
    page.on("pageerror", (error) => {
      pageErrors.push(String(error));
    });
    page.on("console", (message) => {
      if (message.type() === "error") {
        pageErrors.push(message.text());
      }
    });
    await page.goto(`http://127.0.0.1:${port}/`);
    const visibleText = normalizeText(await page.locator("body").innerText());
    assertIncludes(visibleText, "BOOK BOOK BOOK");
    assertIncludes(visibleText, "PDF 업로드");
    assertIncludes(visibleText, "드래그 엔 드롭 가능");
    const pageCursorSummary = await page.evaluate(() => ({
      bodyCursor: getComputedStyle(document.body).cursor,
      menuCursor: getComputedStyle(document.querySelector("[data-intro-toggle]")).cursor,
      selectCursor: getComputedStyle(document.querySelector("[data-paper-size]")).cursor,
    }));
    if (
      ![pageCursorSummary.bodyCursor, pageCursorSummary.menuCursor, pageCursorSummary.selectCursor]
        .every((cursorValue) => cursorValue.includes("cdn.cursors-4u.net/previews/puppy-13-a9c1ade9-32.webp") && cursorValue.includes("32 32"))
    ) {
      throw new Error(`Expected GitHub Pages to use the puppy cursor: ${JSON.stringify(pageCursorSummary)}`);
    }
    const defaultIntroState = await page.evaluate(() => ({
      collapsed: document.querySelector(".app-shell")?.classList.contains("is-intro-collapsed"),
      introVisible: Boolean(document.querySelector(".intro-panel")?.getClientRects().length),
      expanded: document.querySelector("[data-intro-toggle]")?.getAttribute("aria-expanded"),
    }));
    if (!defaultIntroState.collapsed || defaultIntroState.introVisible || defaultIntroState.expanded !== "false") {
      throw new Error(`Expected intro panel to be collapsed by default: ${JSON.stringify(defaultIntroState)}`);
    }
    await page.locator("[data-intro-toggle]").click();
    const openedText = normalizeText(await page.locator("body").innerText());
    assertIncludes(openedText, "PDF를 중철제본이 가능한 소책자 PDF로 만드는");
    assertIncludes(openedText, "단! 재단선 도련선을 끄고 PDF 로 출력후에 북북북으로 변환하세요.");
    await assertPaperControl(page);
    await assertDuplexControl(page);
    await assertPagesButtonStyle(page);
    await convertFixture(page, {
      fixturePath: readerFixturePath,
      outputPath: readerOutputPath,
      inputMode: "drop",
      paperSize: "a3",
      duplexFlip: "long-edge",
      expectedSummary: {
        "원본 PDF 페이지": 4,
        "분리 후 책 쪽수": 6,
        "추가된 빈 페이지": 2,
        "중철 인쇄면": 4,
        "출력 용지 장수": 2,
        "한 장당 배치": "1개",
        "프린터 양면 설정": "긴 쪽 넘김",
      },
    });
    await assertSmallPaperWarning(page);
    await assertResetControl(page);
    await convertFixture(page, {
      fixturePath: readerFixturePath,
      outputPath: readerNoPaperOutputPath,
      paperSize: "none",
      expectedSummary: {
        "원본 PDF 페이지": 4,
        "분리 후 책 쪽수": 6,
        "추가된 빈 페이지": 2,
        "중철 인쇄면": 4,
        "출력 용지 장수": 2,
        "한 장당 배치": "1개",
        "프린터 양면 설정": "짧은 쪽 넘김",
      },
    });
    await convertFixture(page, {
      fixturePath: allSpreadFixturePath,
      outputPath: allSpreadOutputPath,
      paperSize: "a3",
      expectedSummary: {
        "원본 PDF 페이지": 2,
        "분리 후 책 쪽수": 4,
        "추가된 빈 페이지": 0,
        "중철 인쇄면": 2,
        "출력 용지 장수": 1,
        "한 장당 배치": "1개",
        "프린터 양면 설정": "짧은 쪽 넘김",
      },
    });
    assertNoPageErrors(pageErrors);
  } finally {
    await browser.close();
  }

  await assertOutputPdf(readerOutputPath, 4, 1191, 842);
  await assertOutputPdf(readerNoPaperOutputPath, 4, 840, 595);
  await assertOutputPdf(allSpreadOutputPath, 2, 1191, 842);

  console.log("Smoke test passed: browser converted mixed and all-spread PDFs into valid booklet PDFs.");
} finally {
  server.kill("SIGTERM");
}

async function createReaderSpreadFixturePdf(path) {
  await mkdir(dirname(path), { recursive: true });
  const source = await PDFDocument.create();
  const font = await source.embedFont(StandardFonts.Helvetica);
  [
    [420, 595],
    [840, 595],
    [840, 595],
    [420, 595],
  ].forEach(([width, height], index) => {
    const page = source.addPage([width, height]);
    page.drawText(`page ${index + 1}`, { x: 24, y: height - 48, size: 14, font });
  });
  await writeFile(path, await source.save());
}

async function createAllSpreadFixturePdf(path) {
  await mkdir(dirname(path), { recursive: true });
  const source = await PDFDocument.create();
  const font = await source.embedFont(StandardFonts.Helvetica);
  [
    [840, 595],
    [840, 595],
  ].forEach(([width, height], index) => {
    const page = source.addPage([width, height]);
    page.drawText(`spread ${index + 1}`, { x: 24, y: height - 48, size: 14, font });
  });
  await writeFile(path, await source.save());
}

async function convertFixture(page, { fixturePath, outputPath, inputMode, expectedSummary, paperSize = "a4", duplexFlip = "auto" }) {
  if (inputMode === "drop") {
    await dropFixture(page, fixturePath);
  } else {
    await page.setInputFiles("input[type=file]", fixturePath);
  }
  await page.locator("[data-analysis]").waitFor({ timeout: 10_000 });

  const analysisPanel = page.locator("[data-analysis]");
  const analysis = normalizeText(await analysisPanel.innerText());
  assertExcludes(analysis, "PDF 분석");
  assertIncludes(analysis, "PDF 형태");

  const pageNumber = page.locator("[data-page-number]");
  await pageNumber.fill("2");
  await pageNumber.press("Enter");
  const currentPage = await pageNumber.inputValue();
  if (currentPage !== "2") {
    throw new Error(`Expected preview page input to navigate to page 2, received ${currentPage}`);
  }
  await assertFileControlsFollowAnalysis(page);
  await assertPageNumberFollowsFileName(page);

  await page.locator("[data-paper-size]").selectOption(paperSize);
  await page.locator("[data-duplex-flip]").selectOption(duplexFlip);

  const blankPlacementVisible = await page.locator("[data-blank-placement]").isVisible();
  if (expectedSummary["추가된 빈 페이지"] > 0 && !blankPlacementVisible) {
    throw new Error("Expected blank page placement controls to be visible");
  }
  if (expectedSummary["추가된 빈 페이지"] === 0 && blankPlacementVisible) {
    throw new Error("Expected blank page placement controls to be hidden");
  }

  await page.getByRole("button", { name: "소책자 만들기" }).click();
  await page.getByText("변환이 끝났습니다.").waitFor({ timeout: 10_000 });

  const summary = normalizeText(await page.locator("[data-result]").innerText());
  Object.entries(expectedSummary).forEach(([label, value]) => {
    assertIncludes(summary, `${label} ${value}`);
  });
  assertIncludes(summary, "프린터에서도 같은 넘김 방향을 선택하세요.");
  await assertDownloadButtonStyle(page);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "PDF 다운로드" }).click(),
  ]);
  await download.saveAs(outputPath);
}

async function assertSmallPaperWarning(page) {
  await page.locator("[data-paper-size]").selectOption("custom");
  await page.locator("[data-paper-width]").fill("100");
  await page.locator("[data-paper-height]").fill("100");
  await page.getByRole("button", { name: "소책자 만들기" }).click();
  await page.getByText("출력 용지가 작습니다. 판형을 키워주세요.").waitFor({ timeout: 10_000 });
  await page.locator("[data-paper-size]").selectOption("a4");
}

async function assertResetControl(page) {
  await page.locator('input[name="binding"][value="right"]').check();
  await page.locator("[data-duplex-flip]").selectOption("short-edge");
  await page.locator("[data-paper-size]").selectOption("custom");
  await page.getByRole("button", { name: "초기화" }).click();
  await page.getByText("선택된 PDF가 없습니다.").waitFor({ timeout: 10_000 });

  const resetState = await page.evaluate(() => ({
    fileCount: document.querySelector("input[type=file]")?.files?.length ?? -1,
    selectedFile: document.querySelector("[data-preview-name]")?.textContent?.trim(),
    status: document.querySelector("[data-status]")?.textContent?.trim(),
    analysisHidden: document.querySelector("[data-analysis]")?.hasAttribute("hidden"),
    resultHidden: document.querySelector("[data-result]")?.hasAttribute("hidden"),
    previewIsEmpty: document.querySelector("[data-preview-frame]")?.classList.contains("is-empty"),
    pageIndicatorHidden: document.querySelector("[data-page-indicator]")?.hasAttribute("hidden"),
    paperSize: document.querySelector("[data-paper-size]")?.value,
    duplexFlip: document.querySelector("[data-duplex-flip]")?.value,
    leftBinding: document.querySelector('input[name="binding"][value="left"]')?.checked,
    customHidden: document.querySelector("[data-paper-custom]")?.hasAttribute("hidden"),
  }));

  if (
    resetState.fileCount !== 0
    || resetState.selectedFile !== "선택된 PDF가 없습니다."
    || resetState.status !== ""
    || !resetState.analysisHidden
    || !resetState.resultHidden
    || !resetState.previewIsEmpty
    || !resetState.pageIndicatorHidden
    || resetState.paperSize !== "a4"
    || resetState.duplexFlip !== "auto"
    || !resetState.leftBinding
    || !resetState.customHidden
  ) {
    throw new Error(`Expected the reset button to return the app to its initial state: ${JSON.stringify(resetState)}`);
  }
}

async function dropFixture(page, fixturePath) {
  const bytes = Array.from(await readFile(fixturePath));
  const fileName = basename(fixturePath);
  const dataTransfer = await page.evaluateHandle(({ bytes: fileBytes, fileName: name }) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(fileBytes)], name, { type: "application/pdf" }));
    return transfer;
  }, { bytes, fileName });

  await page.dispatchEvent("[data-preview-frame]", "drop", { dataTransfer });
}

async function assertOutputPdf(path, expectedPageCount, expectedWidth, expectedHeight) {
  const output = await PDFDocument.load(await import("node:fs/promises").then((fs) => fs.readFile(path)));
  const firstPage = output.getPage(0);
  if (output.getPageCount() !== expectedPageCount) {
    throw new Error(`Expected ${expectedPageCount} output pages, received ${output.getPageCount()}`);
  }
  if (Math.round(firstPage.getWidth()) !== expectedWidth || Math.round(firstPage.getHeight()) !== expectedHeight) {
    throw new Error(`Unexpected output page size ${firstPage.getWidth()} x ${firstPage.getHeight()}`);
  }
}

async function waitForServer(url) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15_000) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
    }
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function getAvailablePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.on("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") {
          resolvePort(address.port);
        } else {
          rejectPort(new Error("Could not allocate a smoke test port"));
        }
      });
    });
  });
}

async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    if (String(error).includes("Executable doesn't exist")) {
      return chromium.launch({ channel: "chrome", headless: true });
    }
    throw error;
  }
}

function assertIncludes(value, expected) {
  if (!value.includes(expected)) {
    throw new Error(`Expected ${JSON.stringify(value)} to include ${JSON.stringify(expected)}`);
  }
}

function assertExcludes(value, unexpected) {
  if (value.includes(unexpected)) {
    throw new Error(`Expected ${JSON.stringify(value)} not to include ${JSON.stringify(unexpected)}`);
  }
}

async function assertFileControlsFollowAnalysis(page) {
  const analysisBox = await page.locator("[data-analysis]").boundingBox();
  const controlsBox = await page.locator(".preview-actions").boundingBox();

  if (!analysisBox || !controlsBox || controlsBox.y <= analysisBox.y) {
    throw new Error("Expected file controls to appear after the analysis table");
  }
}

async function assertPageNumberFollowsFileName(page) {
  const fileNameBox = await page.locator("[data-preview-name]").boundingBox();
  const pageNumberBox = await page.locator("[data-page-indicator]").boundingBox();

  if (!fileNameBox || !pageNumberBox || pageNumberBox.x <= fileNameBox.x) {
    throw new Error("Expected page number input to sit to the right of the selected file name");
  }
}

async function assertPaperControl(page) {
  const paperSelect = page.locator("[data-paper-size]");
  await paperSelect.waitFor({ timeout: 10_000 });
  const value = await paperSelect.inputValue();
  if (value !== "a4") {
    throw new Error(`Expected default paper setting to be A4, received ${value}`);
  }
  const options = await paperSelect.evaluate((select) => Array.from(select.options).map((option) => option.textContent?.trim() ?? ""));
  if (JSON.stringify(options) !== JSON.stringify(expectedPaperOptions)) {
    throw new Error(`Expected full A/B paper preset options: ${JSON.stringify(options)}`);
  }

  const bindingBox = await page.locator(".binding-options").boundingBox();
  const selectBox = await paperSelect.boundingBox();
  if (!bindingBox || !selectBox || selectBox.y < bindingBox.y - 4 || selectBox.y > bindingBox.y + bindingBox.height + 4) {
    throw new Error("Expected the paper selector to sit beside the binding controls");
  }
  const selectLabelWidth = await paperSelect.evaluate((select) => {
    const textWidthProbe = document.createElement("span");
    const styles = getComputedStyle(select);
    textWidthProbe.textContent = "선택 안 함";
    textWidthProbe.style.position = "absolute";
    textWidthProbe.style.visibility = "hidden";
    textWidthProbe.style.whiteSpace = "nowrap";
    textWidthProbe.style.font = styles.font;
    document.body.append(textWidthProbe);
    const textWidth = textWidthProbe.getBoundingClientRect().width;
    textWidthProbe.remove();
    return textWidth;
  });
  if (selectBox.width < selectLabelWidth + 28) {
    throw new Error(`Expected the paper selector to fit the default label, received ${selectBox.width}px for ${selectLabelWidth}px text`);
  }

  await paperSelect.selectOption("custom");
  const customControls = page.locator("[data-paper-custom]");
  if (!(await customControls.isVisible())) {
    throw new Error("Expected custom paper mm inputs to appear when custom paper is selected");
  }
  await paperSelect.selectOption("a4");
}

async function assertDuplexControl(page) {
  const duplexSelect = page.locator("[data-duplex-flip]");
  await duplexSelect.waitFor({ timeout: 10_000 });
  const value = await duplexSelect.inputValue();
  if (value !== "auto") {
    throw new Error(`Expected default duplex flip setting to be automatic, received ${value}`);
  }
  const options = await duplexSelect.evaluate((select) => Array.from(select.options).map((option) => option.textContent?.trim() ?? ""));
  if (JSON.stringify(options) !== JSON.stringify(expectedDuplexOptions)) {
    throw new Error(`Expected automatic, long-edge, and short-edge duplex options: ${JSON.stringify(options)}`);
  }
}

async function assertPagesButtonStyle(page) {
  const style = await page.evaluate(() => {
    const getNumber = (value) => Number.parseFloat(value) || 0;
    const binding = document.querySelector(".binding-options");
    const primary = document.querySelector(".primary");
    const reset = document.querySelector("[data-reset]");
    const bindingRect = binding.getBoundingClientRect();
    const primaryRect = primary.getBoundingClientRect();
    const resetRect = reset.getBoundingClientRect();
    const bindingStyle = getComputedStyle(binding);
    const primaryStyle = getComputedStyle(primary);
    const resetStyle = getComputedStyle(reset);
    return {
      bindingRadius: getNumber(bindingStyle.borderRadius),
      bindingBorder: bindingStyle.borderTopWidth,
      bindingBackground: bindingStyle.backgroundColor,
      primaryRadius: getNumber(primaryStyle.borderRadius),
      primaryBackground: primaryStyle.backgroundColor,
      primaryWidth: primaryRect.width,
      primaryX: primaryRect.x,
      bindingX: bindingRect.x,
      resetRound: Math.abs(resetRect.width - resetRect.height),
      resetRadius: getNumber(resetStyle.borderRadius),
    };
  });

  if (
    style.bindingRadius < 20
    || style.bindingBorder === "0px"
    || !style.bindingBackground.includes("255, 255, 255")
    || style.primaryRadius < 20
    || !style.primaryBackground.includes("255, 255, 255")
    || style.primaryWidth > 460
    || style.primaryX <= style.bindingX
    || style.resetRound > 1
    || style.resetRadius < 12
  ) {
    throw new Error(`Expected Pages controls to use rounded white pill buttons: ${JSON.stringify(style)}`);
  }
}

async function assertDownloadButtonStyle(page) {
  const style = await page.evaluate(() => {
    const download = document.querySelector(".download");
    const rect = download.getBoundingClientRect();
    const computed = getComputedStyle(download);
    return {
      radius: Number.parseFloat(computed.borderRadius) || 0,
      background: computed.backgroundColor,
      boxShadow: computed.boxShadow,
      borderBottom: computed.borderBottomWidth,
      width: rect.width,
    };
  });

  if (
    style.radius < 20
    || !style.background.includes("255, 255, 255")
    || style.boxShadow !== "none"
    || style.borderBottom === "0px"
    || style.width < 500
  ) {
    throw new Error(`Expected the download button to be a white rounded outline without a green underline: ${JSON.stringify(style)}`);
  }
}

function assertNoPageErrors(errors) {
  if (errors.length > 0) {
    throw new Error(`Unexpected browser error: ${errors.join("\n")}`);
  }
}

function normalizeText(value) {
  return value.replace(/\s+/g, " ").trim();
}
