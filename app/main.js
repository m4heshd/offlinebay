const electron = require('electron');
const url = require('url');
const path = require('path');

const {app, BrowserWindow} = electron;

let mainWindow;

app.on('ready', function () {
    startOB();
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