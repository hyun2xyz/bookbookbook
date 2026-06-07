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
  const isDesktopLiquid = await page.evaluate(() => document.documentElement.classList.contains("desktop-liquid"));
  if (!isDesktopLiquid) {
    throw new Error("Expected Electron renderer to enable the desktop Liquid Glass skin");
  }
  const desktopSummary = await page.evaluate(() => ({
    hasLetterCard: Boolean(document.querySelector(".letter-card")),
    hasUsageCard: Boolean(document.querySelector(".usage-card")),
    hasDraggableTitlebar: getComputedStyle(document.querySelector(".desktop-titlebar-drag")).webkitAppRegion === "drag",
    usageGuideFont: getComputedStyle(document.querySelector(".usage-guide")).fontFamily,
    usageListFontSize: Number.parseFloat(getComputedStyle(document.querySelector(".usage-guide ol")).fontSize),
    usageBodyFontSize: Number.parseFloat(getComputedStyle(document.querySelector(".usage-guide p")).fontSize),
    siteNoteFontSize: Number.parseFloat(getComputedStyle(document.querySelector(".site-note p")).fontSize),
    siteNoteLinkFontSize: Number.parseFloat(getComputedStyle(document.querySelector(".site-note a")).fontSize),
    autoBlankFontSize: Number.parseFloat(getComputedStyle(document.querySelector(".auto-blank-notice")).fontSize),
    previewTitle: document.querySelector(".preview-title h2")?.textContent?.trim(),
    hasIntroToggle: Boolean(document.querySelector("[data-intro-toggle]")),
    isIntroCollapsed: document.querySelector(".app-shell")?.classList.contains("is-intro-collapsed"),
    introVisible: Boolean(document.querySelector(".intro-panel")?.getClientRects().length),
    introExpanded: document.querySelector("[data-intro-toggle]")?.getAttribute("aria-expanded"),
    siteNoteBottomGap: (() => {
      const letter = document.querySelector(".letter-card").getBoundingClientRect();
      const note = document.querySelector(".site-note").getBoundingClientRect();
      return Math.round(letter.bottom - note.bottom);
    })(),
    shellFillsWindow: (() => {
      const shell = document.querySelector(".app-shell");
      return shell ? shell.getBoundingClientRect().width >= window.innerWidth - 14 : false;
    })(),
    hasUpdatedCopy: document.body.textContent.includes("웹/앱 인데요"),
    width: window.outerWidth,
    height: window.outerHeight,
    scrollHeight: document.documentElement.scrollHeight,
    primaryWidth: Math.round(document.querySelector("[data-submit]")?.getBoundingClientRect().width ?? 0),
    hasCursorOverlayMode: document.documentElement.classList.contains("has-puppy-cursor-overlay"),
    hasCursorOverlay: Boolean(document.querySelector(".puppy-cursor-overlay")),
    cursorOverlayBackground: getComputedStyle(document.querySelector(".puppy-cursor-overlay")).backgroundImage,
    cursorOverlayWidth: Math.round(document.querySelector(".puppy-cursor-overlay")?.getBoundingClientRect().width ?? 0),
    cursorOverlayHeight: Math.round(document.querySelector(".puppy-cursor-overlay")?.getBoundingClientRect().height ?? 0),
    appCursor: getComputedStyle(document.body).cursor,
    menuCursor: getComputedStyle(document.querySelector("[data-intro-toggle]")).cursor,
    selectCursor: getComputedStyle(document.querySelector("[data-paper-size]")).cursor,
    titlebarCursor: getComputedStyle(document.querySelector(".desktop-titlebar-drag")).cursor,
  }));
  if (!desktopSummary.hasLetterCard || !desktopSummary.hasUsageCard) {
    throw new Error("Expected the desktop intro area to be split into letter and usage cards");
  }
  if (desktopSummary.previewTitle !== "BOOK BOOK BOOK") {
    throw new Error(`Expected preview title to read BOOK BOOK BOOK: ${JSON.stringify(desktopSummary)}`);
  }
  if (!desktopSummary.hasIntroToggle) {
    throw new Error("Expected an intro collapse toggle button");
  }
  if (!desktopSummary.isIntroCollapsed || desktopSummary.introVisible || desktopSummary.introExpanded !== "false") {
    throw new Error(`Expected the desktop intro area to be collapsed by default: ${JSON.stringify(desktopSummary)}`);
  }
  if (!desktopSummary.hasDraggableTitlebar) {
    throw new Error("Expected the hidden titlebar area to be draggable");
  }
  if (desktopSummary.usageGuideFont.includes("Gowun Batang")) {
    throw new Error(`Expected the usage guide to use the app UI font, received ${desktopSummary.usageGuideFont}`);
  }
  if (desktopSummary.usageListFontSize < 12 || desktopSummary.usageBodyFontSize < 11.6) {
    throw new Error(`Expected the usage guide copy to be larger: ${JSON.stringify(desktopSummary)}`);
  }
  if (
    Math.abs(desktopSummary.siteNoteFontSize - desktopSummary.autoBlankFontSize) > 0.1
    || Math.abs(desktopSummary.siteNoteLinkFontSize - desktopSummary.autoBlankFontSize) > 0.1
  ) {
    throw new Error(`Expected the letter footer note to match the bottom guide note size: ${JSON.stringify(desktopSummary)}`);
  }
  if (desktopSummary.siteNoteBottomGap > 28) {
    throw new Error(`Expected the letter footer note to sit at the bottom of the upper card: ${JSON.stringify(desktopSummary)}`);
  }
  if (!desktopSummary.shellFillsWindow) {
    throw new Error("Expected the desktop Liquid Glass shell to use the available window width");
  }
  if (!desktopSummary.hasUpdatedCopy) {
    throw new Error("Expected intro copy to describe Bookbookbook as a web/app");
  }
  if (desktopSummary.width > 1680 || desktopSummary.height > 1060) {
    throw new Error(`Expected initial desktop window to stay within the desktop layout cap, received ${desktopSummary.width}x${desktopSummary.height}`);
  }
  if (desktopSummary.primaryWidth > 270) {
    throw new Error(`Expected the booklet button to keep compact horizontal margins: ${JSON.stringify(desktopSummary)}`);
  }
  if (!desktopSummary.hasCursorOverlayMode || !desktopSummary.hasCursorOverlay) {
    throw new Error(`Expected the desktop app to enable the puppy cursor overlay: ${JSON.stringify(desktopSummary)}`);
  }
  if (!desktopSummary.cursorOverlayBackground.includes("cdn.cursors-4u.net/previews/puppy-13-a9c1ade9-32.webp")) {
    throw new Error(`Expected the cursor overlay to use the puppy cursor image: ${JSON.stringify(desktopSummary)}`);
  }
  if (desktopSummary.cursorOverlayWidth !== 48 || desktopSummary.cursorOverlayHeight !== 48) {
    throw new Error(`Expected the puppy cursor overlay to keep the restored cursor size: ${JSON.stringify(desktopSummary)}`);
  }
  if (
    ![desktopSummary.appCursor, desktopSummary.menuCursor, desktopSummary.selectCursor, desktopSummary.titlebarCursor]
      .every((cursorValue) => cursorValue === "none")
  ) {
    throw new Error(`Expected the native cursor to be hidden behind the puppy cursor overlay: ${JSON.stringify(desktopSummary)}`);
  }
  await page.mouse.move(320, 240);
  await page.mouse.down();
  const cursorPressed = await page.locator(".puppy-cursor-overlay").evaluate((element) => element.classList.contains("is-pressed"));
  await page.mouse.up();
  if (!cursorPressed) {
    throw new Error("Expected the puppy cursor overlay to show a pressed state while clicking");
  }
  if (desktopSummary.scrollHeight > desktopSummary.height + 1) {
    throw new Error(`Expected initial desktop window content to fit without vertical scrolling, received content height ${desktopSummary.scrollHeight} in ${desktopSummary.height}`);
  }
  const updateMenuLabel = await app.evaluate(({ Menu }) => {
    return Menu.getApplicationMenu()?.getMenuItemById("check-for-updates")?.label ?? null;
  });
  if (updateMenuLabel !== "업데이트 확인") {
    throw new Error("Expected a top menu item for checking updates");
  }

  const introToggle = page.locator("[data-intro-toggle]");
  await introToggle.click();
  const expandedSummary = await page.evaluate(() => ({
    isCollapsed: document.querySelector(".app-shell")?.classList.contains("is-intro-collapsed"),
    introVisible: Boolean(document.querySelector(".intro-panel")?.getClientRects().length),
    expanded: document.querySelector("[data-intro-toggle]")?.getAttribute("aria-expanded"),
    introCopyFontSize: Number.parseFloat(getComputedStyle(document.querySelector(".intro-copy")).fontSize),
    introCopyTextAlign: getComputedStyle(document.querySelector(".intro-copy")).textAlign,
    introCopyTextAlignLast: getComputedStyle(document.querySelector(".intro-copy")).textAlignLast,
    usageCardFits: (() => {
      const card = document.querySelector(".usage-card");
      return card ? card.scrollHeight <= card.clientHeight + 1 : false;
    })(),
    introOpensOnRight: (() => {
      const intro = document.querySelector(".intro-panel")?.getBoundingClientRect();
      const workspace = document.querySelector(".workspace-panel")?.getBoundingClientRect();
      return Boolean(intro && workspace && intro.left > workspace.left);
    })(),
  }));
  if (expandedSummary.isCollapsed || !expandedSummary.introVisible || expandedSummary.expanded !== "true") {
    throw new Error(`Expected intro panel to expand: ${JSON.stringify(expandedSummary)}`);
  }
  if (!expandedSummary.introOpensOnRight) {
    throw new Error(`Expected intro panel to open on the right side: ${JSON.stringify(expandedSummary)}`);
  }
  if (!expandedSummary.usageCardFits) {
    throw new Error(`Expected the usage card content to fit inside the desktop window: ${JSON.stringify(expandedSummary)}`);
  }
  if (expandedSummary.introCopyFontSize > 8.7) {
    throw new Error(`Expected the intro copy to be smaller: ${JSON.stringify(expandedSummary)}`);
  }
  if (expandedSummary.introCopyTextAlign !== "left" || expandedSummary.introCopyTextAlignLast !== "left") {
    throw new Error(`Expected intro copy to be left aligned: ${JSON.stringify(expandedSummary)}`);
  }
  await introToggle.click();
  const collapsedSummary = await page.evaluate(() => ({
    isCollapsed: document.querySelector(".app-shell")?.classList.contains("is-intro-collapsed"),
    introVisible: Boolean(document.querySelector(".intro-panel")?.getClientRects().length),
    expanded: document.querySelector("[data-intro-toggle]")?.getAttribute("aria-expanded"),
  }));
  if (!collapsedSummary.isCollapsed || collapsedSummary.introVisible || collapsedSummary.expanded !== "false") {
    throw new Error(`Expected intro panel to collapse again: ${JSON.stringify(collapsedSummary)}`);
  }

  try {
    await page.getByText("PDF 업로드").waitFor({ timeout: 10_000 });
    const paperSelectLayout = await page.evaluate(() => {
      const select = document.querySelector("[data-paper-size]");
      if (!(select instanceof HTMLSelectElement)) {
        return null;
      }
      const rect = select.getBoundingClientRect();
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
      return {
        value: select.value,
        optionsText: Array.from(select.options).map((option) => option.textContent?.trim()).join(" "),
        width: rect.width,
        textWidth,
      };
    });
    if (
      !paperSelectLayout
      || paperSelectLayout.value !== "a4"
      || paperSelectLayout.optionsText.includes("선택 안 함")
      || !paperSelectLayout.optionsText.includes("커스텀")
      || paperSelectLayout.width < paperSelectLayout.textWidth + 28
    ) {
      throw new Error(`Expected the paper select to default to A4 and fit the custom label: ${JSON.stringify(paperSelectLayout)}`);
    }
    await page.locator("[data-paper-size]").selectOption("a3");
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
  assertIncludes(result, "중철 인쇄면 2");
  assertIncludes(result, "출력 용지 장수 2");
  assertIncludes(result, "한 장당 배치 1개");

  const completedLayout = await page.evaluate(() => {
    const download = document.querySelector(".download");
    const resultPanel = document.querySelector("[data-result]");
    const downloadRect = download?.getBoundingClientRect();
    const resultRect = resultPanel?.getBoundingClientRect();
    return {
      hasDownload: Boolean(download),
      downloadVisible: downloadRect ? downloadRect.bottom <= window.innerHeight + 1 : false,
      resultVisible: resultRect ? resultRect.bottom <= window.innerHeight + 1 : false,
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
    };
  });
  if (!completedLayout.hasDownload || !completedLayout.downloadVisible || !completedLayout.resultVisible) {
    throw new Error(`Expected generated booklet result and download to fit in the desktop window: ${JSON.stringify(completedLayout)}`);
  }
  if (completedLayout.scrollHeight > completedLayout.innerHeight + 1) {
    throw new Error(`Expected completed desktop state to fit without hidden overflow: ${JSON.stringify(completedLayout)}`);
  }

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
