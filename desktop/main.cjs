const { app, BrowserWindow, dialog, Menu, screen, shell, session } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const githubRepo = "hyun2xyz/bookbookbook";
const githubReleasesUrl = `https://github.com/${githubRepo}/releases`;
const githubLatestReleaseApiUrl = `https://api.github.com/repos/${githubRepo}/releases/latest`;
const websiteUrl = "https://hyun2xyz.github.io/bookbookbook/";
const isMasBuild = Boolean(process.mas);
const rendererIndex = app.isPackaged
  ? path.join(__dirname, "renderer", "index.html")
  : path.join(__dirname, "..", "pages", "dist", "index.html");
const rendererOrigin = pathToFileURL(rendererIndex).href;

app.setName("Bookbookbook");

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let mainWindow = null;

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    focusWindow(mainWindow);
    return mainWindow;
  }

  const initialBounds = getInitialWindowBounds();
  const window = new BrowserWindow({
    width: initialBounds.width,
    height: initialBounds.height,
    minWidth: 1120,
    minHeight: 820,
    center: true,
    backgroundColor: "#ffffff",
    title: "Bookbookbook",
    frame: false,
    titleBarStyle: "hidden",
    trafficLightPosition: { x: 28, y: 24 },
    transparent: false,
    webPreferences: {
      allowRunningInsecureContent: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow = window;

  if (process.platform === "darwin") {
    window.setWindowButtonVisibility(true);
  }

  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  window.once("ready-to-show", () => {
    scheduleFocusWindow(window);
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (url === rendererOrigin) {
      return;
    }

    event.preventDefault();
    openExternalUrl(url);
  });

  window.loadFile(rendererIndex, { query: { shell: "desktop" } });
  setTimeout(() => {
    if (!window.isDestroyed()) {
      focusWindow(window);
    }
  }, 1200);
  return window;
}

function focusWindow(window) {
  if (window.isMinimized()) {
    window.restore();
  }

  window.show();
  window.moveTop();

  if (process.platform === "darwin") {
    app.focus({ steal: true });
  }

  window.focus();
}

function scheduleFocusWindow(window) {
  focusWindow(window);

  for (const delay of [250, 900]) {
    setTimeout(() => {
      if (window.isDestroyed()) {
        return;
      }

      focusWindow(window);
    }, delay);
  }
}

function getInitialWindowBounds() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const availableWidth = Math.max(960, width - 32);
  const availableHeight = Math.max(760, height - 32);

  return {
    width: Math.min(availableWidth, Math.max(1260, Math.floor(width * 0.86)), 1640),
    height: Math.min(availableHeight, Math.max(900, Math.floor(height * 0.9)), 1040),
  };
}

function createApplicationMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: "about", label: "Bookbookbook 정보" },
            { type: "separator" },
            {
              id: "check-for-updates",
              label: "업데이트 확인",
              click: (_menuItem, browserWindow) => {
                void handleUpdateCheck(browserWindow ?? BrowserWindow.getFocusedWindow());
              },
            },
            { type: "separator" },
            { role: "services", label: "서비스" },
            { type: "separator" },
            { role: "hide", label: "Bookbookbook 가리기" },
            { role: "hideOthers", label: "다른 항목 가리기" },
            { role: "unhide", label: "모두 보기" },
            { type: "separator" },
            { role: "quit", label: "Bookbookbook 종료" },
          ],
        }]
      : [{
          label: "Bookbookbook",
          submenu: [
            {
              id: "check-for-updates",
              label: "업데이트 확인",
              click: (_menuItem, browserWindow) => {
                void handleUpdateCheck(browserWindow ?? BrowserWindow.getFocusedWindow());
              },
            },
            { type: "separator" },
            { role: "quit", label: "종료" },
          ],
        }]),
    {
      label: "편집",
      submenu: [
        { role: "undo", label: "실행 취소" },
        { role: "redo", label: "다시 실행" },
        { type: "separator" },
        { role: "cut", label: "오려두기" },
        { role: "copy", label: "복사" },
        { role: "paste", label: "붙여넣기" },
        { role: "selectAll", label: "전체 선택" },
      ],
    },
    {
      label: "보기",
      submenu: [
        { role: "reload", label: "새로고침" },
        { role: "togglefullscreen", label: "전체 화면" },
      ],
    },
    {
      label: "창",
      submenu: [
        { role: "minimize", label: "최소화" },
        { role: "close", label: "닫기" },
      ],
    },
    {
      label: "도움말",
      submenu: [
        {
          label: isMasBuild ? "Bookbookbook 웹사이트 열기" : "GitHub 릴리즈 열기",
          click: () => {
            openExternalUrl(isMasBuild ? websiteUrl : githubReleasesUrl);
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function handleUpdateCheck(owner) {
  if (isMasBuild) {
    await showUpdateDialog(owner, {
      message: "App Store에서 업데이트할 수 있습니다.",
      detail: "Mac App Store 버전은 App Store 앱의 업데이트 목록에서 최신 버전을 확인하고 설치해 주세요.",
      buttons: ["확인"],
      url: websiteUrl,
    });
    return;
  }

  await checkForUpdates(owner);
}

async function checkForUpdates(owner) {
  try {
    const response = await fetch(githubLatestReleaseApiUrl, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": `Bookbookbook/${app.getVersion()}`,
      },
    });

    if (response.status === 404) {
      await showUpdateDialog(owner, {
        message: "아직 공개된 업데이트가 없습니다.",
        detail: "GitHub Releases에 새 DMG가 올라오면 여기서 확인하고 열 수 있습니다.",
        buttons: ["확인", "GitHub 열기"],
        url: githubReleasesUrl,
      });
      return;
    }

    if (!response.ok) {
      throw new Error(`GitHub update check failed with ${response.status}`);
    }

    const release = await response.json();
    const latestVersion = normalizeVersion(release.tag_name || release.name || "");
    const currentVersion = normalizeVersion(app.getVersion());
    const updateUrl = getReleaseDownloadUrl(release) || release.html_url || githubReleasesUrl;

    if (latestVersion && compareVersions(latestVersion, currentVersion) > 0) {
      await showUpdateDialog(owner, {
        message: `새 버전 ${latestVersion}이 있습니다.`,
        detail: `현재 버전은 ${currentVersion}입니다. GitHub에서 최신 DMG를 받을 수 있습니다.`,
        buttons: ["업데이트 열기", "나중에"],
        url: updateUrl,
      });
      return;
    }

    await showUpdateDialog(owner, {
      message: "최신 버전입니다.",
      detail: `현재 버전 ${currentVersion}을 사용하고 있습니다.`,
      buttons: ["확인", "GitHub 열기"],
      url: githubReleasesUrl,
    });
  } catch {
    await showUpdateDialog(owner, {
      message: "업데이트를 확인하지 못했습니다.",
      detail: "네트워크 상태를 확인한 뒤 다시 시도해 주세요.",
      buttons: ["확인", "GitHub 열기"],
      url: githubReleasesUrl,
    });
  }
}

async function showUpdateDialog(owner, options) {
  const clicked = await dialog.showMessageBox(owner ?? undefined, {
    type: "info",
    message: options.message,
    detail: options.detail,
    buttons: options.buttons,
    defaultId: 0,
    cancelId: options.buttons.length - 1,
    noLink: true,
  });

  if (clicked.response === 0 && options.buttons[0] === "업데이트 열기") {
    openExternalUrl(options.url);
  }

  if (clicked.response === 1 && options.buttons[1] === "GitHub 열기") {
    openExternalUrl(options.url);
  }
}

function getReleaseDownloadUrl(release) {
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const dmg = assets.find((asset) => typeof asset.browser_download_url === "string" && asset.browser_download_url.endsWith(".dmg"));
  return dmg?.browser_download_url ?? null;
}

function normalizeVersion(version) {
  return String(version).trim().replace(/^v/i, "");
}

function compareVersions(a, b) {
  const left = a.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const right = b.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

function openExternalUrl(url) {
  if (!url.startsWith("https://")) {
    return;
  }

  shell.openExternal(url).catch(() => {});
}

app.whenReady().then(() => {
  createApplicationMenu();

  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  session.defaultSession.on("will-download", (_event, item, webContents) => {
    const owner = BrowserWindow.fromWebContents(webContents);
    const savePath = dialog.showSaveDialogSync(owner ?? undefined, {
      defaultPath: item.getFilename(),
      filters: [{ name: "PDF", extensions: ["pdf"] }],
      title: "PDF 저장하기",
    });

    if (!savePath) {
      item.cancel();
      return;
    }

    item.setSavePath(savePath);
  });

  createWindow();

  app.on("activate", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      focusWindow(mainWindow);
    } else {
      createWindow();
    }
  });
});

app.on("second-instance", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    focusWindow(mainWindow);
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
