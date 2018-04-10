/* A bit faster than method 1. Too much garbage collection. Child process will be alive for too long.
 Line by line method is only needed for fast-csv */

const fs = require('fs');
const es = require('event-stream');
const csv = require('fast-csv');
const path = require('path');
require('v8').setFlagsFromString('--harmony'); //To fix the regex Lookbehind issue

process.on('uncaughtException', function (error) {
    console.log(error);
    process.send(['import-failed', 'general']); //mainWindow.webContents.send('import-failed', 'general');
});

let args = process.argv.slice(2);
let filePath = args[0];

let lineNr = 0;

importDump(filePath);

function importDump(filePath) {
    let totalLines = 0;

    countFileLines(filePath).then(function (count) {
        console.log('Total line count : ', count);
        totalLines = count;
        startImport();
    }).catch(function (err) {
        process.send(['import-failed', 'read']);// mainWindow.webContents.send('import-failed', 'read');
        console.log(err);
    });

    function startImport() {

        fs.truncate(path.join(process.cwd(), 'data', 'stage.csv'), 0, function (err) {
            let stage = fs.createWriteStream(path.join(process.cwd(), 'data', 'stage.csv'), {
                flags: 'a'
            }).on('error', function (err) {
                stage.close();
                console.log(err);
                process.send(['import-failed', 'temp']);// mainWindow.webContents.send('import-failed', 'temp');
            }).on('open', function () {
                let s = fs.createReadStream(filePath)
                    .pipe(es.split())
                    .pipe(es.mapSync(function (line) {

                            s.pause();

                            lineNr += 1;

                            let formattedLine = line.replace(/(?!";)(?<!;)(?<!\\)"/g, '\\"');
                            // stage.write(formattedLine + '\n');

                            csv.fromString(formattedLine, {
                                delimiter: ';',
                                escape: '\\'
                            })
                                .on('data', function () {
                                    stage.write(formattedLine + '\n');
                                })
                                .on('error', function () {
                                    console.error('INVALID LINE : ', formattedLine);
                                });

                            let progress = Math.round((lineNr / totalLines) * 100);
                            process.send(['import-update', progress]);
                            s.resume();
                        })
                            .on('error', function (err) {
                                process.send(['import-failed', 'general']); //mainWindow.webContents.send('import-failed', 'general');
                                console.log('Error while reading file.', err);
                            })
                            .on('end', function () {
                                stage.close();
                                console.log(lineNr);
                                if (lineNr === totalLines) {
                                    process.send(['import-success', 'null']);// mainWindow.webContents.send('import-success');
                                    console.log('FINALIZED');
                                } else {
                                    process.send(['import-failed', 'process']); //mainWindow.webContents.send('import-failed', 'process');
                                }
                                console.log(process.uptime());
                            })
                    );
            });
        });
    }
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
}