/* Tested to be working with the TPB dump at best. Extremely fast, zero Memory leaks and no garbage collection needed.
*  Process exits immediately. Put together to work with papaparse */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
require('v8').setFlagsFromString('--harmony'); //To fix the regex Lookbehind issue

// Keep the application from crashing on unexpected errors
process.on('uncaughtException', function (error) {
    console.log(error);
    process.send(['import-failed', 'general']); //mainWindow.webContents.send('import-failed', 'general');
});

let args = process.argv.slice(2);
let isUpd = (args[0] === 'true');
let filePath = args[1];
let timestamp = args[2];
let stagePath = path.join(process.cwd(), 'data', 'stage.csv');
let extract = path.join(process.cwd(), 'data', 'downloads', 'torrent_dump_full.csv');
let totalLines = 0;

// Determine if the file is a compressed dump or an extracted CSV and proceed to the corresponding function
let ext = path.extname(filePath).toLowerCase();
if (ext === '.gz') {
    decompressDump();
} else if (ext === '.csv') {
    extract = filePath;
    startCSV();
} else {
    process.send(['import-failed', 'invalid']);// mainWindow.webContents.send('import-failed', 'invalid');
}

// Validate and start the importing process
function startCSV(){
    validate().then(function () {
        countFileLines(extract).then(function (count) {
            console.log('Total line count : ', count);
            totalLines = count;
            startImport();
        }).catch(function (err) {
            process.send(['import-failed', 'read']);// mainWindow.webContents.send('import-failed', 'read');
            console.log(err);
        });
    }).catch(function (err) {
        // console.log('Invalid dump');
        switch (err) {
            case 0:
                process.send(['import-failed', 'invalid']);// mainWindow.webContents.send('import-failed', 'invalid');
                break;
            default:
                process.send(['import-failed', 'read']);// mainWindow.webContents.send('import-failed', 'read');
                break;
        }
    });
}

// Validate the header of the CSV file to identify if it's a TPB dump
function validate() {
    return new Promise((resolve, reject) => {
        process.send(['import-validate']);// mainWindow.webContents.send('import-validate');
        let reader = fs.createReadStream(extract)
            .on("data", function (buffer) {
                let header = buffer.toString().split('\n')[0];
                reader.close();
                if (header === '#ADDED;HASH(B64);NAME;SIZE(BYTES)') {
                    resolve();
                } else {
                    reject(0);
                }
            })
            .on("error", function (err) {
                console.log(err);
                reject(1);
            })
    });
}

// Truncate the staging file if exist or create, Process the data and import.
function startImport() {
    fs.truncate(stagePath, 0, function (err) {
        let stage = fs.createWriteStream(stagePath, {
            flags: 'a'
        }).on('error', function (err) {
            stage.close();
            console.log(err);
            process.send(['import-failed', 'temp']);// mainWindow.webContents.send('import-failed', 'temp');
        }).on('open', function () {
            let lineCount = 1;
            fs.createReadStream(extract)
                .on("data", function (buffer) {
                    let idx = -1;
                    lineCount--;
                    // console.log(buffer.toString());
                    let formattedLine = buffer.toString().replace(/(?!";)(?<!;)(?<!\\)"/g, '\\"');
                    stage.write(formattedLine);
                    do {
                        idx = buffer.indexOf(10, idx + 1);
                        lineCount++;
                    } while (idx !== -1);
                    let progress = Math.round((lineCount / totalLines) * 100);
                    process.send(['import-update', ['import', progress]]);
                })
                .on("error", function (err) {
                    stage.close();
                    console.log(err);
                    process.send(['import-failed', 'read']);// mainWindow.webContents.send('import-failed', 'read');
                })
                .on("end", function () {
                    stage.close();
                    console.log(lineCount);
                    if (lineCount === totalLines) {
                        finalize();
                    } else {
                        process.send(['import-failed', 'process']); //mainWindow.webContents.send('import-failed', 'process');
                    }
                    console.log(process.uptime());
                });
        });
    });
}

// Decompress the input file if it's a compressed .gz before importing
function decompressDump() {
    let unzip = zlib.createGunzip();
    let size;
    fs.stat(filePath, function (err, data) {
        size = data.size;
    });

    let out = fs.createWriteStream(extract)
        .on('error', function (err) {
            process.send(['import-failed', 'csv-create']); //mainWindow.webContents.send('import-failed', 'csv-create');
            console.log(err);
        })
        .on('open', function () {
            let chLength = 0;
            fs.createReadStream(filePath)
                .on('data', function (chunk) {
                    chLength += chunk.length;
                    let progress = Math.round((chLength / size) * 100);
                    process.send(['import-update', ['extract', progress]]); //mainWindow.webContents.send('upd-dump-update', ['extract', progress]);
                })
                .on('error', function (err) {
                    process.send(['import-failed', 'gz-extract']); //mainWindow.webContents.send('upd-dump-failed', 'gz-extract');
                    console.log(err);
                }).pipe(unzip).pipe(out);
        })
        .once('close', function () {
            try {
                let final = fs.openSync(extract, 'r+'); // This step is needed because 'fd' returned by the 'open' event will be null at this point.
                fs.fsyncSync(final); // This part is essential because the disk cache won't be flushed before importing and processed file will end up with missing bytes
                startCSV();
            } catch (error) {
                console.log(error);
                process.send(['import-failed', 'after-extract']); //mainWindow.webContents.send('upd-dump-failed', 'after-extract');
            }
        });
}

// Rename the stage.csv to processed.csv and clean up any unwanted data
function finalize(){
    process.send(['import-finalizing', 'null']);// mainWindow.webContents.send('import-finalizing');

    let final = fs.openSync(stagePath, 'r+');
    fs.fsyncSync(final);

    let processed = path.join(process.cwd(), 'data', 'processed.csv');

    fs.rename(stagePath, processed, function (err) {
        if (err){
            process.send(['import-failed', 'finalize']); //mainWindow.webContents.send('import-failed', 'finalize');
        } else {
            if (isUpd) {
                fs.unlink(filePath, function (err) {
                    if (err) {
                        console.log(err);
                        process.send(['notify', ['Unable to remove downloaded file', 'danger']]); //mainWindow.webContents.send('notify', ['Unable to remove downloaded file', 'danger']);
                    }
                    fs.unlink(extract, function (err) {
                        if (err) {
                            console.log(err);
                            process.send(['notify', ['Unable to remove extracted file', 'danger']]); //mainWindow.webContents.send('notify', ['Unable to remove downloaded file', 'danger']);
                        }
                        process.send(['import-success', timestamp]);// mainWindow.webContents.send('import-success', timestamp);
                    });
                });
            } else {
                // Last updated time will be the opened file's modified time if manually imported
                let tstamp = new Date().toString();
                if (ext === '.gz') {
                    fs.unlink(extract, function (err) {
                        if (err) {
                            console.log(err);
                            process.send(['notify', ['Unable to remove extracted file', 'danger']]); //mainWindow.webContents.send('notify', ['Unable to remove downloaded file', 'danger']);
                        }
                        fs.stat(filePath, function (err, data) {
                            tstamp = data.mtime;
                            process.send(['import-success', tstamp]);// mainWindow.webContents.send('import-success', tstamp);
                        });
                    });
                } else {
                    fs.stat(filePath, function (err, data) {
                        tstamp = data.mtime;
                        process.send(['import-success', tstamp]);// mainWindow.webContents.send('import-success', tstamp);
                    });
                }
            }
        }
    });
}

// Get the total line count of the opened dump file for progress calculation and end validation
function countFileLines(filePath) {
    return new Promise((resolve, reject) => {
        let lineCount = 1;
        fs.createReadStream(filePath)
            .on("data", (buffer) => {
                let idx = -1;
                lineCount--;
                do {
                    idx = buffer.indexOf(10, idx + 1);
                    lineCount++;
                } while (idx !== -1);
            }).on("end", () => {
            resolve(lineCount);
        }).on("error", reject);
    });
}