const electron = require('electron');
const url = require('url');
const path = require('path');

const {app, BrowserWindow, ipcMain} = electron;

let mainWindow;

app.on('ready', function () {
    startOB();

    mainWindow.on('close', function () {
        mainWindow = null;
    });
    mainWindow.on('closed', function () {
        app.quit();
    });
    mainWindow.on('maximize', function () {
        mainWindow.webContents.send('maxed');
    });
    mainWindow.on('unmaximize', function () {
        mainWindow.webContents.send('restored');
    });
});

ipcMain.on('app-close', function () {
    app.quit();
});
ipcMain.on('app-min', function () {
    mainWindow.minimize();
});
ipcMain.on('app-max', function () {
    mainWindow.isMaximized() ? mainWindow.restore() : mainWindow.maximize();
});

function startOB() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 644,
        minHeight: 698,
        show: false,
        frame: false,
        backgroundColor: '#1e2a31'
    });

    mainWindow.loadURL(url.format({
        pathname: path.join(__dirname, 'WndMain.html'),
        protocol: 'file:',
        slashes: true
    }));

    mainWindow.once('ready-to-show', function () {
        mainWindow.show();
    });
}