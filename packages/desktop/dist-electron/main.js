import { app, BrowserWindow, ipcMain } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getVersion } from "@google/gemini-cli-core";
const __filename$1 = fileURLToPath(import.meta.url);
const __dirname$1 = dirname(__filename$1);
process.env.DIST = join(__dirname$1, "../dist");
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : join(process.env.DIST, "../public");
if (!process.env.VITE_PUBLIC) {
  throw new Error("VITE_PUBLIC not defined");
}
let win;
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
function createWindow() {
  win = new BrowserWindow({
    icon: join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    webPreferences: {
      preload: join(__dirname$1, "preload.mjs")
    }
  });
  win.webContents.on("did-finish-load", () => {
    win?.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  });
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(join(process.env.DIST, "index.html"));
  }
}
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
app.whenReady().then(() => {
  ipcMain.handle("get-version", () => getVersion());
  createWindow();
});
