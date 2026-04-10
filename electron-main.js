const { app, BrowserWindow, Tray, Menu, Notification, nativeImage, ipcMain, shell } = require('electron');
const path = require('path');

let mainWindow;
let tray;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#02010d',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    frame: false,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true
    },
    icon: path.join(__dirname, '../src/assets/icon.png')
  });

  mainWindow.loadFile(path.join(__dirname, '../src/index.html'));

  // Auto-hide menu bar
  mainWindow.setMenuBarVisibility(false);

  // Keep in memory when closed (tray app)
  mainWindow.on('close', (e) => {
    if (!app.isQuiting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function createTray() {
  const iconPath = path.join(__dirname, '../src/assets/tray-icon.png');
  tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }));

  const menu = Menu.buildFromTemplate([
    { label: 'Open AEGIS', click: () => mainWindow.show() },
    { type: 'separator' },
    { label: 'Dashboard', click: () => { mainWindow.show(); mainWindow.webContents.executeJavaScript("nav('dashboard',null)"); } },
    { label: 'ClaveShard Orders', click: () => { mainWindow.show(); mainWindow.webContents.executeJavaScript("nav('orders',null)"); } },
    { label: 'Servers', click: () => { mainWindow.show(); mainWindow.webContents.executeJavaScript("nav('servers',null)"); } },
    { type: 'separator' },
    { label: 'Quit AEGIS', click: () => { app.isQuiting = true; app.quit(); } }
  ]);

  tray.setToolTip('AEGIS Admin — TheConclave');
  tray.setContextMenu(menu);
  tray.on('click', () => mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show());
}

// Push notification bridge from renderer
ipcMain.on('push-notify', (event, { title, body }) => {
  new Notification({ title, body, silent: false }).show();
});

app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow.show();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
