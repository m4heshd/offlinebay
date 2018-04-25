const cp = require('child_process');
const electron = require('electron');
const url = require('url');
const path = require('path');
const Datastore = require('nedb');
const request = require('request');

const {app, BrowserWindow, ipcMain, dialog} = electron;

app.commandLine.appendSwitch('remote-debugging-port', '9222');

let prefs = {
    maxed: false,
    position: [0, 0],
    size: [1200, 800],
    rs_count: 100,
    smart: true,
    inst: false,
    lastUpd: new Date('2017-01-06T11:44:34.000Z')
};
let procImport;
let procSearch;
let procScrape;
let procUpd;
let scrapeOpts = [];
let finalPrefs = false;
let awaitingQuit = false;
let awaitingScrape = false;
let mainWindow;

/* Process handles
--------------------*/
// Emitted if the window is waiting for child processes to exit
process.on('cont-quit', function () {
    if (!procSearch && !procImport && !procScrape) {
        app.quit();
    }
});
// Emitted if the window is waiting for child processes to exit
process.on('cont-scrape', function () {
    if (!procScrape) {
        initScrape(scrapeOpts[0], scrapeOpts[1]);
    }
});

// process.on('uncaughtException', function (error) {
//     console.log(error);
//     if (mainWindow){
//         mainWindow.webContents.send('import-failed');
//     }
// });

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

// Load prefs from config DB and start OfflineBay
function loadSession() {
    config.findOne({type: 'win-state'}, function (err, dbPref) {
        if (!err && dbPref) {
            prefs.maxed = dbPref.maxed;
            prefs.position = dbPref.position;
            prefs.size = dbPref.size;
        } else {
            setTimeout(popDbErr, 1500);
        }
        startOB();
    })
}

// Get the endpoint URL to update trackers
function getTrackerEP() {
    return new Promise((resolve, reject) => {
        config.findOne({type: 'trackers'}, function (err, trck) {
            if (!err && trck) {
                resolve(trck.url);
            } else {
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
                reject();
            } else {
                resolve();
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

/* Import */
ipcMain.on('pop-import', function (event) {
    initImport(event, false, '', ''); // (event, isUpd, filePath, timestamp)
}); // Import dump file open dialog

ipcMain.on('upd-import', function (event, data) {
    initImport(event, true, data[0], data[1]);
}); // Import dump file after update is downloaded

/* Search */
ipcMain.on('search-start', function (event, data) {
    initSearch(data[0], data[1], data[2], data[3]);
}); // Handle search event

/* Preferences */
ipcMain.on('pref-change', function (event, data) {
    prefs[data[0]] = data[1];
}); // Handle any preference change event

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
        case 'check':
            checkDumpUpd(type, data[0]);
            break;
        case 'user':
            initUpdDump(data[0]);
            break;
    }
}); // Handle update dump event

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
        }
    });

    mainWindow.loadURL(url.format({
        pathname: path.join(__dirname, 'WndMain.html'),
        protocol: 'file:',
        slashes: true
    }));

    mainWindow.once('ready-to-show', function () {
        if (prefs.maxed) {
            mainWindow.maximize();
        }
        mainWindow.show();
    });

    mainWindow.on('close', function (event) {
        if (procImport) {
            waitProcess(event, procImport, '\'IMPORT\'');
        } // Validation of any running child processes before closing (Import)
        if (procSearch) {
            waitProcess(event, procSearch, '\'SEARCH\'');
        } // Validation of any running child processes before closing (Search)
        if (procSearch) {
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
}

// Show open dialog and initiate import child process
function initImport(event, isUpd, filePath, timestamp) {
    if (!isUpd) {
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
                procImport = cp.fork(path.join(__dirname, 'main-functions', 'import-dump.js'), [false, dlg[0], ''], {
                    cwd: __dirname
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
    } else {
        if (!procImport) {
            event.sender.send('import-start');
            procImport = cp.fork(path.join(__dirname, 'main-functions', 'import-dump.js'), [true, filePath, timestamp], {
                cwd: __dirname
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
}

// Initiate search child process
function initSearch(query, count, smart, inst) {
    if (!procSearch) {
        procSearch = cp.fork(path.join(__dirname, 'main-functions', 'search.js'), [query, count, smart, inst], {
            cwd: __dirname
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
            cwd: __dirname
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
function initUpdDump(dlURL) {
    if (!procSearch && !procImport) {
        if (!procUpd) {
            procUpd = cp.fork(path.join(__dirname, 'main-functions', 'upd-dump.js'), [dlURL], {
                cwd: __dirname
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
            popWarn('One update process is already running');
        }
    } else {
        popWarn('Dump file is busy at the moment');
    }
}

function checkDumpUpd(type, dlURL) {
    if (!procUpd && !procImport) {
        let req = request({
            method: 'GET',
            uri: dlURL
        });

        req.on('response', function (data) {
            if ((data.headers['content-type'].split('/')[0]) === 'application') {
                let update = new Date(data.headers['last-modified']) - prefs.lastUpd;
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
                            mainWindow.webContents.send('upd-dump-init');
                            initUpdDump(dlURL);
                        } else {
                            mainWindow.webContents.send('hide-ol');
                        }
                    }
                } else {
                    mainWindow.webContents.send('upd-check-unavail');
                }
            } else {
                mainWindow.webContents.send('upd-check-failed', 'content');
            }
            req.abort();
        });
        req.on('error', function (err) {
            console.log(err);
            mainWindow.webContents.send('upd-check-failed', 'download');
        });
    } else {
        popWarn('An update process or import process is already running');
    }
}