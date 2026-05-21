import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import { PDFDocument, StandardFonts } from "pdf-lib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const fixturePath = resolve(__dirname, "reader-spreads-fixture.pdf");
const outputPath = resolve(__dirname, "smoke-output.pdf");
const port = 4173;

await createFixturePdf(fixturePath);

const server = spawn("npx", ["vite", "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
});

try {
  await waitForServer(`http://127.0.0.1:${port}/`);

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.setInputFiles("input[type=file]", fixturePath);
    await page.getByRole("button", { name: "중철 PDF 만들기" }).click();
    await page.getByText("변환이 끝났습니다.").waitFor({ timeout: 10_000 });

    const summary = await page.locator("[data-result]").innerText();
    assertIncludes(summary, "원본 PDF 페이지");
    assertIncludes(summary, "4");
    assertIncludes(summary, "추가된 빈 페이지");
    assertIncludes(summary, "2");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "PDF 다운로드" }).click(),
    ]);
    await download.saveAs(outputPath);
  } finally {
    await browser.close();
  }

  const output = await PDFDocument.load(await import("node:fs/promises").then((fs) => fs.readFile(outputPath)));
  const firstPage = output.getPage(0);
  if (output.getPageCount() !== 4) {
    throw new Error(`Expected 4 output pages, received ${output.getPageCount()}`);
  }
  if (Math.round(firstPage.getWidth()) !== 840 || Math.round(firstPage.getHeight()) !== 595) {
    throw new Error(`Unexpected output page size ${firstPage.getWidth()} x ${firstPage.getHeight()}`);
  }

  console.log("Smoke test passed: browser converted and downloaded a valid booklet PDF.");
} finally {
  server.kill("SIGTERM");
}

async function createFixturePdf(path) {
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
