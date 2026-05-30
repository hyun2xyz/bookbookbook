import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { _electron as electron } from "playwright";
import { PDFDocument, StandardFonts } from "pdf-lib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(__dirname, "..");
const fixturePath = resolve(desktopRoot, "dist", "desktop-smoke-fixture.pdf");
const executablePath = process.env.BOOKBOOKBOOK_APP || undefined;

await createFixturePdf(fixturePath);

const app = await electron.launch({
  ...(executablePath ? { executablePath } : {}),
  args: executablePath ? [] : [desktopRoot],
});

try {
  const page = await app.firstWindow();
  const pageErrors = [];
  page.on("pageerror", (error) => {
    pageErrors.push(String(error));
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      pageErrors.push(message.text());
    }
  });

  await page.waitForLoadState("domcontentloaded");
  try {
    await page.getByText("PDF 업로드").waitFor({ timeout: 10_000 });
    await page.setInputFiles("input[type=file]", fixturePath);
    await page.locator("[data-analysis]").waitFor({ timeout: 10_000 });
    await page.getByRole("button", { name: "소책자 만들기" }).click();
    await page.getByText("변환이 끝났습니다.").waitFor({ timeout: 10_000 });
  } catch (error) {
    const bodyText = normalizeText(await page.locator("body").innerText().catch(() => ""));
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nPage text: ${bodyText}\nPage errors: ${pageErrors.join("\n")}`);
  }

  const result = normalizeText(await page.locator("[data-result]").innerText());
  assertIncludes(result, "원본 PDF 페이지 4");
  assertIncludes(result, "출력 인쇄면 2");

  if (pageErrors.length > 0) {
    throw new Error(`Unexpected desktop page error: ${pageErrors.join("\n")}`);
  }

  console.log("Desktop smoke test passed: Electron app loaded and converted a local PDF.");
} finally {
  await app.close();
}

async function createFixturePdf(path) {
  await mkdir(dirname(path), { recursive: true });
  const source = await PDFDocument.create();
  const font = await source.embedFont(StandardFonts.Helvetica);

  Array.from({ length: 4 }, (_value, index) => {
    const page = source.addPage([420, 595]);
    page.drawText(`page ${index + 1}`, { x: 24, y: 547, size: 14, font });
  });

  await writeFile(path, await source.save());
}

function assertIncludes(value, expected) {
  if (!value.includes(expected)) {
    throw new Error(`Expected ${JSON.stringify(value)} to include ${JSON.stringify(expected)}`);
  }
}

function normalizeText(value) {
  return value.replace(/\s+/g, " ").trim();
}
