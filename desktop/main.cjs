const { app, BrowserWindow, dialog, shell, session } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const rendererIndex = app.isPackaged
  ? path.join(__dirname, "renderer", "index.html")
  : path.join(__dirname, "..", "pages", "dist", "index.html");
const rendererOrigin = pathToFileURL(rendererIndex).href;

app.setName("Bookbookbook");

function createWindow() {
  const window = new BrowserWindow({
    width: 1240,
    height: 900,
    minWidth: 860,
    minHeight: 680,
    backgroundColor: "#ffffff",
    title: "Bookbookbook",
    webPreferences: {
      allowRunningInsecureContent: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
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

  window.loadFile(rendererIndex);
}

function openExternalUrl(url) {
  if (!url.startsWith("https://")) {
    return;
  }

  shell.openExternal(url).catch(() => {});
}

app.whenReady().then(() => {
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
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
