import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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
const port = 4173;

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
    assertIncludes(visibleText, "PDF 업로드");
    assertIncludes(visibleText, "드래그 엔 드롭 가능");
    await convertFixture(page, {
      fixturePath: readerFixturePath,
      outputPath: readerOutputPath,
      inputMode: "drop",
      expectedSummary: {
        "원본 PDF 페이지": 4,
        "분리 후 책 쪽수": 6,
        "추가된 빈 페이지": 2,
        "출력 인쇄면": 4,
      },
    });
    await convertFixture(page, {
      fixturePath: allSpreadFixturePath,
      outputPath: allSpreadOutputPath,
      expectedSummary: {
        "원본 PDF 페이지": 2,
        "분리 후 책 쪽수": 4,
        "추가된 빈 페이지": 0,
        "출력 인쇄면": 2,
      },
    });
    assertNoPageErrors(pageErrors);
  } finally {
    await browser.close();
  }

  await assertOutputPdf(readerOutputPath, 4, 840, 595);
  await assertOutputPdf(allSpreadOutputPath, 2, 840, 595);

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

async function convertFixture(page, { fixturePath, outputPath, inputMode, expectedSummary }) {
  if (inputMode === "drop") {
    await dropFixture(page, fixturePath);
  } else {
    await page.setInputFiles("input[type=file]", fixturePath);
  }
  await page.locator("[data-analysis]").waitFor({ timeout: 10_000 });

  const analysis = normalizeText(await page.locator("[data-analysis]").innerText());
  assertIncludes(analysis, "PDF 분석");
  assertIncludes(analysis, "PDF 형태");

  const pageNumber = page.locator("[data-page-number]");
  await pageNumber.fill("2");
  await pageNumber.press("Enter");
  const currentPage = await pageNumber.inputValue();
  if (currentPage !== "2") {
    throw new Error(`Expected preview page input to navigate to page 2, received ${currentPage}`);
  }

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

function assertNoPageErrors(errors) {
  if (errors.length > 0) {
    throw new Error(`Unexpected browser error: ${errors.join("\n")}`);
  }
}

function normalizeText(value) {
  return value.replace(/\s+/g, " ").trim();
}
