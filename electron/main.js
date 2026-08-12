const { app, BrowserWindow, shell } = require('electron');
const path = require('node:path');

const APP_ROOT = new URL(`file:///${path.join(__dirname, '..').replace(/\\/g, '/')}/`).href;

function openExternalUrl(url) {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
}

function createWindow() {
    const window = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 1024,
        minHeight: 700,
        backgroundColor: '#0b0d12',
        title: 'Plannke',
        icon: path.join(__dirname, '..', 'assets', 'icons', 'plannke-icon.svg'),
        show: false,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    });

    window.once('ready-to-show', () => window.show());

    window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
        callback(false);
    });

    window.webContents.setWindowOpenHandler(({ url }) => {
        if (!url.startsWith(APP_ROOT)) openExternalUrl(url);
        return { action: 'deny' };
    });

    window.webContents.on('will-navigate', (event, url) => {
        if (!url.startsWith(APP_ROOT)) {
            event.preventDefault();
            openExternalUrl(url);
        }
    });

    window.loadFile(path.join(__dirname, '..', 'index.html'));
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
