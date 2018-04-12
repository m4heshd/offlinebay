const cp = require('child_process');
const electron = require('electron');
const url = require('url');
const path = require('path');

const {app, BrowserWindow, ipcMain, dialog} = electron;

app.commandLine.appendSwitch('remote-debugging-port', '9222');

let procImport;
let procSearch;
let awaitingQuit = false;
let mainWindow;

/* Process handles
--------------------*/
process.on('cont-quit', function () {
    if (!procSearch && !procImport) {
        app.quit();
    }
}); // Emitted if the window is waiting for child processes to exit

// process.on('uncaughtException', function (error) {
//     console.log(error);
//     mainWindow.webContents.send('import-failed');
// });

/* Main App handles
--------------------*/
app.on('ready', function () {
    startOB();
});

/* IPC Event handling
----------------------*/
/* Window controls */
ipcMain.on('app-close', function () {
    app.quit();
}); // Close button control
ipcMain.on('app-min', function () {
    mainWindow.minimize();
}); // Minimize button control
ipcMain.on('app-max', function () {
    mainWindow.isMaximized() ? mainWindow.restore() : mainWindow.maximize();
}); // Maximize/Restore button control

/* Dialogs */
ipcMain.on('pop-import', function (event) {
    initImport(event);
}); // Import dump file open dialog

/* Search */
ipcMain.on('search-start', function (event, data) {
    initSearch(data[0], data[1], data[2]);
}); // Handle search event

/* Notification senders
------------------------*/
function popMsg(msg) {
    mainWindow.webContents.send('notify', [msg, 'info']);
} // Show blue background notification
function popSuccess(msg) {
    mainWindow.webContents.send('notify', [msg, 'success']);
} // Show green background notification
function popErr(msg) {
    mainWindow.webContents.send('notify', [msg, 'danger']);
} // Show red background notification
function popWarn(msg) {
    mainWindow.webContents.send('notify', [msg, 'warning']);
} //

/* Misc Functions
------------------*/
function waitProcess(event, _process, name) {
    event.preventDefault();
    _process.kill('SIGINT');
    popWarn('Wait for background process ' + name + ' to finish');
    awaitingQuit = true;
}
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

    mainWindow.on('close', function (event) {
        if (procImport) {
            waitProcess(event, procImport, '\'IMPORT\'');
        } // Validation of any running child processes before closing (Import)
        if (procSearch) {
            waitProcess(event, procSearch, '\'SEARCH\'');
        } // Validation of any running child processes before closing (Search)
    });
    mainWindow.on('closed', function () {
        mainWindow = null;
        app.quit();
    });
    mainWindow.on('maximize', function () {
        mainWindow.webContents.send('maxed');
    });
    mainWindow.on('unmaximize', function () {
        mainWindow.webContents.send('restored');
    });
} // Create the main window and handle events

function initImport(event) {
    let dlg = dialog.showOpenDialog(
        mainWindow,
        {
            properties: ['openFile'],
            title: 'Open dump file (CSV)',
            filters: [
                {name: 'CSV Files', extensions: ['csv']}
            ]
        });

    if (typeof dlg !== "undefined") {
        if (!procImport) {
            event.sender.send('import-start');
            procImport = cp.fork(path.join(__dirname, 'main-functions', 'import-dump.js'), [dlg[0]], {
                cwd: __dirname
            });
            procImport.on('exit', function () {
                console.log('Import process ended');
                procImport = null;
                if (awaitingQuit){
                    process.emit('cont-quit');
                }
            });
            procImport.on('message', function (m) {
                mainWindow.webContents.send(m[0], m[1]);
            });
        } else {
            popWarn('One Import process is already running');
        }

    }
} // Show open dialog and initiate import child process

function initSearch(query, count, smart) {
    if (!procSearch) {
        procSearch = cp.fork(path.join(__dirname, 'main-functions', 'search.js'), [query, count, smart], {
            cwd: __dirname
        });
        procSearch.on('exit', function () {
            console.log('Search process ended');
            procSearch = null;
            if (awaitingQuit){
                process.emit('cont-quit');
            }
        });
        procSearch.on('message', function (m) {
            mainWindow.webContents.send(m[0], m[1]);
        });
    } else {
        popWarn('One Search process is already running');
        mainWindow.webContents.send('hide-ol');
    }
} // Initiate search child process