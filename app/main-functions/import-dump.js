/* Tested to be working with the TPB dump at best. Extremely fast, zero Memory leaks and no garbage collection needed.
*  Process exits immediately. Put together to work with papaparse */

const fs = require('fs');
const path = require('path');
require('v8').setFlagsFromString('--harmony'); //To fix the regex Lookbehind issue

process.on('uncaughtException', function (error) {
    console.log(error);
    process.send(['import-failed', 'general']); //mainWindow.webContents.send('import-failed', 'general');
});

let args = process.argv.slice(2);
let filePath = args[0];
let stagePath = path.join(process.cwd(), 'data', 'stage.csv');

let totalLines = 0;


validate().then(function () {
    // console.log('Valid dump');
    countFileLines(filePath).then(function (count) {
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
}); //Validate the Dump file before importing

function validate() {
    return new Promise((resolve, reject) => {
        let reader = fs.createReadStream(filePath)
            .on("data", (buffer) => {
                let header = buffer.toString().split('\n')[0];
                reader.close();
                if (header === '#ADDED;HASH(B64);NAME;SIZE(BYTES)') {
                    resolve();
                } else {
                    reject(0);
                }
                // console.log(header);
            })
            .on("error", function (err) {
                console.log(err);
                reject(1);
            })
    });
}

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
            fs.createReadStream(filePath)
                .on("data", (buffer) => {
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
                    process.send(['import-update', progress]);
                })
                .on("error", function (err) {
                    stage.close();
                    console.log(err);
                    process.send(['import-failed', 'read']);// mainWindow.webContents.send('import-failed', 'read');
                })
                .on("end", () => {
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
} // Truncate the staging file if exist or create, Process the data and import.

function finalize(){
    process.send(['import-finalizing', 'null']);// mainWindow.webContents.send('import-finalizing');

    fs.rename(stagePath, path.join(process.cwd(), 'data', 'processed.csv'), function (err) {
        if (err){
            process.send(['import-failed', 'finalize']); //mainWindow.webContents.send('import-failed', 'finalize');
        } else {
            process.send(['import-success', 'null']);// mainWindow.webContents.send('import-success');
            console.log('FINALIZED');
        }
    });
}

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
} // Get the total line count of the opened dump file for progress calculation and end validation