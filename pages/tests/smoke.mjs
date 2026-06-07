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
const allSpreadFixturePath = resolve(__dirname, "all-spreads-fixture.pdf");
const allSpreadOutputPath = resolve(__dirname, "smoke-output-all-spreads.pdf");
const port = await getAvailablePort();

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
    await convertFixture(page, {
      fixturePath: readerFixturePath,
      outputPath: readerOutputPath,
      inputMode: "drop",
      paperSize: "a3",
      expectedSummary: {
        "원본 PDF 페이지": 4,
        "분리 후 책 쪽수": 6,
        "추가된 빈 페이지": 2,
        "중철 인쇄면": 4,
        "출력 용지 장수": 4,
        "한 장당 배치": "1개",
      },
    });
    await assertSmallPaperWarning(page);
    await convertFixture(page, {
      fixturePath: allSpreadFixturePath,
      outputPath: allSpreadOutputPath,
      paperSize: "a3",
      expectedSummary: {
        "원본 PDF 페이지": 2,
        "분리 후 책 쪽수": 4,
        "추가된 빈 페이지": 0,
        "중철 인쇄면": 2,
        "출력 용지 장수": 2,
        "한 장당 배치": "1개",
      },
    });
    assertNoPageErrors(pageErrors);
  } finally {
    await browser.close();
  }

  await assertOutputPdf(readerOutputPath, 4, 1191, 842);
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

async function convertFixture(page, { fixturePath, outputPath, inputMode, expectedSummary, paperSize = "a4" }) {
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
  const optionsText = await paperSelect.evaluate((select) => Array.from(select.options).map((option) => option.textContent?.trim()).join(" "));
  assertExcludes(optionsText, "선택 안 함");
  assertIncludes(optionsText, "커스텀");

  const bindingBox = await page.locator(".binding-options").boundingBox();
  const selectBox = await paperSelect.boundingBox();
  if (!bindingBox || !selectBox || selectBox.y < bindingBox.y - 4 || selectBox.y > bindingBox.y + bindingBox.height + 4) {
    throw new Error("Expected the paper selector to sit beside the binding controls");
  }
  const selectLabelWidth = await paperSelect.evaluate((select) => {
    const textWidthProbe = document.createElement("span");
    const styles = getComputedStyle(select);
    textWidthProbe.textContent = "커스텀";
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

function assertNoPageErrors(errors) {
  if (errors.length > 0) {
    throw new Error(`Unexpected browser error: ${errors.join("\n")}`);
  }
}

function normalizeText(value) {
  return value.replace(/\s+/g, " ").trim();
}
