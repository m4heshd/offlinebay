/* Seems to be extremely slow. Too much garbage collection. Line by line method is only needed for fast-csv */

const fs = require('fs-extra');
const path = require('path');
const csv = require('fast-csv');
const readline = require('readline');
require('v8').setFlagsFromString('--harmony'); //To fix the regex Lookbehind issue

process.on('uncaughtException', function (error) {
    console.log(error);
    process.send(['import-failed', 'general']); //mainWindow.webContents.send('import-failed', 'general');
});

let args = process.argv.slice(2);
let filePath = args[0];

console.log(filePath);

importDump(filePath);

function importDump(filePath) {
    let totalLines = 0;

    countFileLines(filePath).then(function (count) {
        console.log(count);
        totalLines = count;
        startImport();
    }).catch(function (err) {
        process.send(['import-failed', 'read']);// mainWindow.webContents.send('import-failed', 'read');
        console.log(err);
    });

    function startImport() {
        try {
            try {
                fs.truncateSync(path.join(process.cwd(), 'data', 'stage.csv'), 0);
            } catch (error) {
                console.log('Staging file not found');
            }

            let stage = fs.createWriteStream(path.join(process.cwd(), 'data', 'stage.csv'), {
                flags: 'a'
            }).on('error', function (err) {
                stage.close();
                console.log(err);
                process.send(['import-failed', 'temp']);// mainWindow.webContents.send('import-failed', 'temp');
            }).on('open', function () {
                // console.log('OPENED');
                let curLine = 0;

                let lineReader = readline.createInterface({
                    input: fs.createReadStream(filePath)
                });

                lineReader.on('line', function (line) {
                    lineReader.pause();
                    // console.log('READ');
                    let formattedLine = line.replace(/(?!";)(?<!;)(?<!\\)"/g, '\\"');
                    // stage.write(formattedLine);
                    // console.log(line);

                    csv.fromString(formattedLine, {
                        delimiter: ';',
                        escape: '\\'
                    })
                        .on('data', function () {
                            stage.write(formattedLine + '\n');
                            console.log('WRITE');
                        })
                        .on('error', function () {
                            console.error('INVALID LINE : ', formattedLine);
                        })
                        .on('end', function () {
                            // lineReader.resume();
                        });


                    curLine++;
                    // console.log(curLine + ' ' + line);
                    let progress = Math.round((curLine / totalLines) * 100);

                    // console.log(Math.round(progress) + '%');
                    process.send(['import-update', progress + '%']);// mainWindow.webContents.send('import-update', progress + '%');

                }).on('close', function () {
                    stage.end();
                    console.log(process.uptime());
                    console.log('CUR : ' + curLine + '\n' + 'TOT : ' + totalLines);
                    if (curLine === totalLines) {
                        process.send(['import-success', 'null']);// mainWindow.webContents.send('import-success');
                        console.log('FINALIZED');
                    }
                    //implement old file delete and rename here
                });
            }).on('close', function () {
                console.log('CLOSED');
            });
        } catch (error) {
            console.log(error);
            process.send(['import-failed', 'general']); //mainWindow.webContents.send('import-failed', 'general');
        }
    }
}

function countFileLines(filePath) {
    return new Promise((resolve, reject) => {
        let lineCount = 1;
        fs.createReadStream(filePath)
            .on("data", (buffer) => {
                let idx = -1;
                lineCount--; // Because the loop will run once for idx=-1
                do {
                    idx = buffer.indexOf(10, idx + 1);
                    lineCount++;
                } while (idx !== -1);
            }).on("end", () => {
            resolve(lineCount);
        }).on("error", reject);
    });
}