/* QR9SkRpC1piyc/5wR87+vRl4oKxTFO28fjaeGeiafGCE1A== ;) */

const cp = require('child_process');
const electron = require('electron');
const url = require('url');
const path = require('path');
const Datastore = require('nedb');
const request = require('request');
const fs = require('fs');
const util = require('util');
const moment = require('moment');

const {app, BrowserWindow, ipcMain, dialog, Menu, Tray} = electron;

app.setAppUserModelId(process.execPath); // To support Windows notifications

let prefs = {
    maxed: false,
    position: [0, 0],
    size: [1200, 800],
    rs_count: 100,
    smart: true,
    inst: false,
    logToFile: true
};
let procImport;
let procSearch;
let procScrape;
let procUpd;
let scrapeOpts = [];
let finalPrefs = false;
let awaitingQuit = false;
let awaitingScrape = false;
let splashWindow;
let mainWindow;
let obTray;
let appIcon = path.join(__dirname, 'img', 'icon.png');
let trayIcon = path.join(__dirname, 'img', 'icon_32.png');
let version = 'N/A';

// Log to file
let logger = fs.createWriteStream(path.join(__dirname, 'data', 'logger.log'));
logger.on('error', function (err) {
    console.log(err);
    logger = null;
});
console.log = function () {
    let data = util.format.apply(this, arguments) + '\n';
    if (prefs.logToFile) {
        if (logger) {
            logger.write(`[${moment().format('YYYY-MM-DD hh:mm:ss')}] : ${data}`);
        }
        process.stdout.write(data);
    } else {
        process.stdout.write(data);
    }
};

// Get current version from package.json
try {
    const packageJSON = require(path.join(__dirname, '..', 'package.json'));
    if (packageJSON) {
        version = packageJSON.version;
    }
} catch (error) {
    console.log(error);
}

// Set app & tray icons
switch (process.platform) {
    case 'win32':
        appIcon = path.join(__dirname, 'img', 'icon.ico');
        trayIcon = appIcon;
        break;
    case 'darwin':
        appIcon = path.join(__dirname, 'img', 'icon.icns');
        trayIcon = path.join(__dirname, 'img', 'icon_16.png');
        break;
}

/* Process handles
--------------------*/
// Emitted if the window is waiting for child processes to exit
process.on('cont-quit', function () {
    if (!procSearch && !procImport && !procScrape && !procUpd) {
        app.quit();
    }
});
// Emitted if the window is waiting for one scrape process to finish to start the next
process.on('cont-scrape', function () {
    if (!procScrape) {
        initScrape(scrapeOpts[0], scrapeOpts[1]);
    }
});

process.on('uncaughtException', function (error) {
    console.log(error);
    if (mainWindow){
        popErr('An unknown error occurred');
    } else {
        app.quit();
    }
});

/* DB functions
----------------*/
// Loads the configurations DB
let config = new Datastore({
    filename: path.join(__dirname, 'data', 'config.db'),
    autoload: true
});

// Update the prefs object
function updatePrefs() {
    prefs.maxed = mainWindow.isMaximized();
    if (!prefs.maxed) {
        prefs.position = mainWindow.getPosition();
        prefs.size = mainWindow.getSize();
    }
}

// Save the current prefs to config DB
function saveSession() {
    return new Promise((resolve, reject) => {
        config.update({type: 'win-state'}, {
            $set: {
                maxed: prefs.maxed,
                position: prefs.position,
                size: prefs.size
            }
        }, {}, function (err, numReplaced) {
            if (err || numReplaced < 1) {
                console.log(err);
            }
            config.update({type: 'search'}, {
                $set: {
                    rs_count: prefs.rs_count,
                    smart: prefs.smart,
                    inst: prefs.inst
                }
            }, {}, function (err, numReplaced) {
                if (err || numReplaced < 1) {
                    console.log(err);
                }
                finalPrefs = true;
                resolve();
            });
        });
    });
}

// Update updLast on DB
function saveUpdLast(updLast) {
    return new Promise((resolve, reject) => {
        config.update({type: 'dump'}, { $set: { updLast: updLast } }, function (err, numReplaced) {
            if (err || numReplaced < 1) {
                console.log(err);
                reject();
            } else {
                resolve();
            }
        })
    });
}

// Update last support message shown timestamp on DB
function updSupMsgDate() {
    config.update({type: 'gen'}, {$set: {supMsg: new Date().toISOString()}}, function (err, numReplaced) {
        if (err || numReplaced < 1) {
            console.log(err);
            console.log('An error occurred trying to update Support message timestamp');
        }
    })
}

// Load prefs from config DB and start OfflineBay
function loadSession() {
    showSplash();
    config.findOne({type: 'win-state'}, function (err, dbPref) {
        if (!err && dbPref) {
            prefs.maxed = dbPref.maxed;
            prefs.position = dbPref.position;
            prefs.size = dbPref.size;

            config.findOne({type: 'gen'}, function (err, dbPref) {
                if (!err && dbPref) {
                    prefs.logToFile = dbPref.logToFile;
                    startOB();
                } else {
                    setTimeout(popDbErr, 1500);
                }
            })
        } else {
            console.log(err);
            setTimeout(popDbErr, 1500);
        }
    })
}

// Get the endpoint URL to update trackers
function getTrackerEP() {
    return new Promise((resolve, reject) => {
        config.findOne({type: 'trackers'}, function (err, trck) {
            if (!err && trck) {
                resolve(trck.url);
            } else {
                console.log(err);
                reject();
            }
        })
    });
}

// Update trackers list on DB
function setTrackers(trcks) {
    return new Promise((resolve, reject) => {
        config.update({type: 'trackers'}, { $set: { trackers: trcks } }, function (err, numReplaced) {
            if (err || numReplaced < 1) {
                console.log(err);
                reject();
            } else {
                resolve();
            }
        })
    });
}

// Update preferences from renderer process
function saveRndPrefs(rndPrefs) {
    return new Promise((resolve, reject) => {
        config.update({type: 'gen'}, {
            $set: {
                sysTray: rndPrefs.sysTray,
                useDHT: rndPrefs.useDHT,
                logToFile: prefs.logToFile
            }
        }, function (err, numReplaced) {
            if (err || numReplaced < 1) {
                console.log(err);
                reject();
            } else {
                config.update({type: 'trackers'}, {$set: {url: rndPrefs.trckURL}}, function (err, numReplaced) {
                    if (err || numReplaced < 1) {
                        console.log(err);
                        reject();
                    } else {
                        config.update({type: 'dump'}, {
                            $set: {
                                updURL: rndPrefs.updURL,
                                updType: rndPrefs.updType,
                                updInt: rndPrefs.updInt,
                                keepDL: rndPrefs.keepDL
                            }
                        }, function (err, numReplaced) {
                            if (err || numReplaced < 1) {
                                console.log(err);
                                reject();
                            } else {
                                resolve();
                            }
                        })
                    }
                })
            }
        })
    });
}

function popDbErr() {
    if (mainWindow) {
        popErr('DB error occurred. Please re-install OfflineBay');
    }
}

/* Main App handles
--------------------*/
app.on('ready', loadSession);

// Save the instance data to config DB before quitting
app.on('will-quit', async function (event) {
    if (!finalPrefs) {
        event.preventDefault();
        await saveSession();
        app.quit();
    }
});

/* IPC Event handling
----------------------*/
/* Logger */
ipcMain.on('logger', function (event, data) {
    console.log(data);
}); // Handle console.logs from Renderer
ipcMain.on('get-logger-type', function (event) {
    event.returnValue = prefs.logToFile;
}); // Handle Get logger type request

/* Window controls */
ipcMain.on('app-close', function (event, data) {
    data ? mainWindow.hide() : app.quit();
}); // Close button control
ipcMain.on('app-min', function () {
    mainWindow.minimize();
}); // Minimize button control
ipcMain.on('app-max', function () {
    mainWindow.isMaximized() ? mainWindow.restore() : mainWindow.maximize();
}); // Maximize/Restore button control
ipcMain.on('show-win', function () {
    mainWindow.show();
    mainWindow.focus();
}); // Show and focus mainWindow
ipcMain.on('drag-enter', function () {
    if (!procSearch && !procUpd && !procImport) {
        mainWindow.webContents.send('show-drag-ol');
    }
}); // Validate 'dragenter' event on mainWindow
ipcMain.on('drag-leave', function () {
    if (!procSearch && !procUpd && !procImport) {
        mainWindow.webContents.send('hide-ol');
    }
}); // Validate 'dragleave' event on mainWindow

/* Import */
ipcMain.on('pop-import', function () {
    popImport();
}); // Import dump file open dialog
ipcMain.on('drop-import', function (event, data) {
    if (!procSearch && !procUpd) {
        doImport(false, data, '', false); // (isUpd, filePath, timestamp, keepDL)
    } else {
        popErr('Cannot import in the middle of another process');
    }
}); // Import files dragged and dropped to the mainWindow
ipcMain.on('upd-import', function (event, data) {
    if (!procSearch) {
        doImport(true, data[0], data[1], data[2]);
    } else {
        popWarn('Can\'t update the dump file in the middle of searching')
    }
}); // Import dump file after update is downloaded

/* Search */
ipcMain.on('search-start', function (event, data) {
    initSearch(data[0], data[1], data[2], data[3]);
}); // Handle search event

/* Preferences */
ipcMain.on('pref-change', function (event, data) {
    prefs[data[0]] = data[1];
}); // Handle any preference change event
ipcMain.on('save-rnd-prefs', function (event, data) {
    saveRndPrefs(data).then(function () {
        popSuccess('Settings were saved successfully');
    }).catch(function () {
        popErr('Failed to save settings to the DB')
    });
}); // Handle saving of preferences from renderer process
ipcMain.on('save-upd-last', function (event, data) {
    saveUpdLast(data[0]).then(function () {
        if (data[1] === 'reset') {
            popSuccess('Dump update was Reset successfully');
        }
    }).catch(function () {
        switch (data[1]) {
            case 'import':
                popErr('Failed to update dump Timestamp on DB');
                break;
            case 'reset':
                popErr('Failed to Reset update on DB');
                break;
        }
    });
}); // Handle updLast update event

/* Scrape */
ipcMain.on('scrape-start', function (event, data) {
    initScrape(data[0], data[1]);
}); // Handle seed/peer count event

/* Trackers */
ipcMain.on('upd-trackers', function () {
    updTrackers();
}); // Handle update trackers event

/* Update dump */
ipcMain.on('upd-dump', function (event, data) {
    let type = data[1];
    switch (type) {
        case 'auto':
        case 'check':
        case 'notify':
            // console.log(type);
            checkDumpUpd(type, data[0], data[2]);
            break;
        case 'user':
            initUpdDump(type, data[0]);
            break;
        case 'tray':
            if (mainWindow.isMinimized() || !mainWindow.isVisible()) {
                checkDumpUpd('notify', data[0], data[2]);
            } else {
                checkDumpUpd('check', data[0], data[2]);
            }
            break;
    }
}); // Handle update dump event

/* Themes */
ipcMain.on('theme-import', function () {
    popThemeImport();
}); // Handle import theme event

/* Misc */
ipcMain.on('update-sup-msg', function () {
    updSupMsgDate();
}); // Handle 'update support message timestamp' event

/* Notification senders
------------------------*/
// Show blue background notification
function popMsg(msg) {
    mainWindow.webContents.send('notify', [msg, 'info']);
}
// Show green background notification
function popSuccess(msg) {
    mainWindow.webContents.send('notify', [msg, 'success']);
}
// Show red background notification
function popErr(msg) {
    mainWindow.webContents.send('notify', [msg, 'danger']);
}
// Show yellow background notification
function popWarn(msg) {
    mainWindow.webContents.send('notify', [msg, 'warning']);
}

/* Misc Functions
------------------*/
// Initiate the waiting boolean and kill the corresponding child process
function waitProcess(event, _process, name) {
    event.preventDefault();
    awaitingQuit = true;
    popWarn('Wait for background process ' + name + ' to finish');
    _process.kill('SIGINT');
}

// Show splash window and load main window
function showSplash() {
    splashWindow = new BrowserWindow({
        width: 300,
        height: 300,
        resizable: false,
        show: false,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        icon: appIcon,
        title: 'OfflineBay by TechTac'
    });

    splashWindow.loadURL(url.format({
        pathname: path.join(__dirname, 'WndSplash.html'),
        protocol: 'file:',
        slashes: true
    }));

    splashWindow.webContents.once('dom-ready', function () {
        splashWindow.show();
    });

    splashWindow.once('show', function () {
        splashWindow.webContents.send('fade');
    });
}

// Create the main window and handle events
function startOB() {
    mainWindow = new BrowserWindow({
        width: prefs.size[0],
        height: prefs.size[1],
        x: prefs.position[0],
        y: prefs.position[1],
        minWidth: 762,
        minHeight: 757,
        show: false,
        frame: false,
        backgroundColor: '#1e2a31',
        webPreferences: {
            experimentalFeatures: true
        },
        icon: appIcon,
        title: 'OfflineBay by TechTac'
    });

    mainWindow.loadURL(url.format({
        pathname: path.join(__dirname, 'WndMain.html'),
        protocol: 'file:',
        slashes: true
    }));

    mainWindow.webContents.once('dom-ready', function () {
        if (prefs.maxed) {
            mainWindow.maximize();
        }
        mainWindow.webContents.send('set-version', version);
        mainWindow.show();
    });

    mainWindow.once('show', function () {
        if (splashWindow) {
            splashWindow.destroy();
        }
    });

    mainWindow.on('close', function (event) {
        if (procImport) {
            waitProcess(event, procImport, '\'IMPORT\'');
        } // Validation of any running child processes before closing (Import)
        if (procSearch) {
            waitProcess(event, procSearch, '\'SEARCH\'');
        } // Validation of any running child processes before closing (Search)
        if (procScrape) {
            waitProcess(event, procScrape, '\'SCRAPE\'');
        } // Validation of any running child processes before closing (Scrape)
        if (procUpd) {
            waitProcess(event, procUpd, '\'UPDATE\'');
        } // Validation of any running child processes before closing (Update)
    });
    mainWindow.on('closed', function () {
        mainWindow = null;
        app.quit();
    });
    mainWindow.on('maximize', function () {
        mainWindow.webContents.send('maxed');
        updatePrefs();
    });
    mainWindow.on('unmaximize', function () {
        mainWindow.webContents.send('restored');
        updatePrefs();
    });
    // Using the following events will ensure that the prefs object is always updated.
    // Handling this in the window close event may record incorrect data.
    mainWindow.on('move', function () {
        updatePrefs();
    });
    mainWindow.on('resize', function () {
        updatePrefs();
    });

    setSysTray();
}

// Create system tray icon and functions
function setSysTray() {
    obTray = new Tray(trayIcon);
    const trayMnu = Menu.buildFromTemplate([
        {label: 'OfflineBay ' + version, icon: path.join(__dirname, 'img', 'icon_16.png'), enabled: false},
        {type: 'separator'},
        {label: 'Show', click: showWindow},
        {label: 'Center on screen', click: centerWindow},
        {label: 'Check dump updates', click: updCheckRequest},
        {type: 'separator'},
        {label: 'Quit', click: app.quit}
    ]);
    obTray.setToolTip('OfflineBay');
    obTray.setContextMenu(trayMnu);

    obTray.on('click', showWindow);
    obTray.on('double-click', showWindow);

    function centerWindow(){
        mainWindow.center();
    }

    function showWindow(){
        mainWindow.show();
        mainWindow.focus();
    }

    function updCheckRequest() {
        mainWindow.webContents.send('upd-check-tray');
    }
}

// Show open dialog for dump imports
function popImport() {
    let dlg = dialog.showOpenDialog(
        mainWindow,
        {
            properties: ['openFile'],
            title: 'Open dump file (CSV or GZ)',
            filters: [
                {name: 'Dump Files', extensions: ['csv', 'gz']}
            ]
        });

    if (typeof dlg !== "undefined") {
        doImport(false, dlg[0], '', false);
    }
}

// Perform dump import process (Update or manual)
function doImport(isUpd, filePath, timestamp, keepDL) {
    if (!procImport) {
        mainWindow.webContents.send('import-start');
        procImport = cp.fork(path.join(__dirname, 'main-functions', 'import-dump.js'), [isUpd, filePath, timestamp, keepDL], {
            cwd: __dirname,
            silent: true
        });
        procImport.stdout.on('data', function (data) {
            console.log(data.toString().slice(0,-1));
        });
        procImport.on('exit', function () {
            console.log('Import process ended');
            procImport = null;
            if (awaitingQuit) {
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

// Initiate search child process
function initSearch(query, count, smart, inst) {
    if (!procSearch) {
        procSearch = cp.fork(path.join(__dirname, 'main-functions', 'search.js'), [query, count, smart, inst], {
            cwd: __dirname,
            silent: true
        });
        procSearch.stdout.on('data', function (data) {
            console.log(data.toString().slice(0,-1));
        });
        procSearch.on('exit', function () {
            console.log('Search process ended');
            procSearch = null;
            if (awaitingQuit) {
                process.emit('cont-quit');
            }
        });
        procSearch.on('message', function (m) {
            mainWindow.webContents.send(m[0], m[1]);
        });
        mainWindow.webContents.send('search-init');
    } else {
        popWarn('One Search process is already running');
        mainWindow.webContents.send('hide-ol');
    }
}

// Initiate tracker scrape child process
function initScrape(hash, isDHT) {
    if (!procScrape) {
        mainWindow.webContents.send('scrape-init');
        procScrape = cp.fork(path.join(__dirname, 'main-functions', 'scrape.js'), [hash, isDHT], {
            cwd: __dirname,
            silent: true
        });
        procScrape.stdout.on('data', function (data) {
            console.log(data.toString().slice(0,-1));
        });
        procScrape.on('exit', function () {
            console.log('Scraping process ended');
            procScrape = null;
            if (awaitingQuit) {
                process.emit('cont-quit');
            }
            if (awaitingScrape) {
                process.emit('cont-scrape');
                awaitingScrape = false;
            } else {
                mainWindow.webContents.send('scrape-end');
            }
        });
        procScrape.on('message', function (m) {
            mainWindow.webContents.send(m[0], m[1]);
        });
    } else {
        awaitingScrape = true;
        scrapeOpts = [hash, isDHT];
        procScrape.kill('SIGINT');
    }
}

// Start tracker updating process
function updTrackers(){
    getTrackerEP().then(function (url) {
        request.get(url, function (err, res, body) {
            if (err) {
                console.log(err);
                mainWindow.webContents.send('upd-trackers-failed', 'net');
            }
            else {
                let trcks = body.trim().split('\n\n');
                if (trcks.length > 0) {
                    setTrackers(trcks).then(function () {
                        mainWindow.webContents.send('upd-trackers-success', trcks);
                    }).catch(function () {
                        mainWindow.webContents.send('upd-trackers-failed', 'update');
                    });
                } else {
                    mainWindow.webContents.send('upd-trackers-failed', 'empty');
                }
            }
        });
    }).catch(function () {
        mainWindow.webContents.send('upd-trackers-failed', 'ep');
    });
}

/* Dump updates
----------------*/
// Initialize dump update
function initUpdDump(type, dlURL) {
    if (!procSearch && !procImport) {
        if (!procUpd) {
            procUpd = cp.fork(path.join(__dirname, 'main-functions', 'upd-dump.js'), [type, dlURL], {
                cwd: __dirname,
                silent: true
            });
            procUpd.stdout.on('data', function (data) {
                console.log(data.toString().slice(0,-1));
            });
            procUpd.on('exit', function () {
                console.log('Dump update process ended');
                procUpd = null;
                if (awaitingQuit) {
                    process.emit('cont-quit');
                }
            });
            procUpd.on('message', function (m) {
                mainWindow.webContents.send(m[0], m[1]);
            });
        } else {
            if (type === 'user') {
                popWarn('One update process is already running');
            }
        }
    } else {
        if (type === 'user') {
            popWarn('Can\'t update. Dump file is busy at the moment');
        }
    }
}

// Check for dump file updates
function checkDumpUpd(type, dlURL, updLast) {
    if (!procUpd && !procImport) {
        let req = request({
            method: 'GET',
            uri: dlURL
        });

        req.on('response', function (data) {
            if ((data.headers['content-type'].split('/')[0]) === 'application') {
                let update = new Date(data.headers['last-modified']) - new Date(updLast);
                if (update > 0) {
                    if (type === 'check') {
                        let res = dialog.showMessageBox(
                            mainWindow,
                            {
                                type: 'question',
                                buttons: ['Yes', 'No'],
                                title: 'Update confirmation',
                                message: 'An update is available. Do you want to proceed with the download?',
                                cancelId: 1
                            });

                        if (res === 0) {
                            mainWindow.webContents.send('upd-dump-init', 'user');
                            initUpdDump('user', dlURL);
                        } else {
                            mainWindow.webContents.send('hide-ol');
                            mainWindow.webContents.send('hide-stat');
                        }
                    } else if (type === 'notify') {
                        mainWindow.webContents.send('upd-check-notify');
                    } else if (type === 'auto') {
                        mainWindow.webContents.send('upd-dump-init', type);
                        initUpdDump(type, dlURL);
                    }
                } else {
                    mainWindow.webContents.send('upd-check-unavail', type);
                }
            } else {
                mainWindow.webContents.send('upd-check-failed', ['content', type]);
            }
            req.abort();
        });
        req.on('error', function (err) {
            console.log(err);
            mainWindow.webContents.send('upd-check-failed', ['download', type]);
        });
    } else {
        if (type === 'check') {
            popWarn('An update process or import process is already running');
        }
    }
}

/* Themes
-----------*/
// Show open dialog to import themes
function popThemeImport() {
    let dlg = dialog.showOpenDialog(
        mainWindow,
        {
            properties: ['openFile'],
            title: 'Open OfflineBay Theme (ZIP)',
            filters: [
                {name: 'Theme packages', extensions: ['zip']}
            ]
        });

    if (typeof dlg !== "undefined") {
        mainWindow.webContents.send('init-theme-import', dlg[0]);
    }
}