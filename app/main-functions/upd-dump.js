const request = require('request');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

process.on('uncaughtException', function (error) {
    console.log(error);
    process.send(['upd-dump-failed', 'general']); //mainWindow.webContents.send('upd-dump-failed', 'general');
});

let args = process.argv.slice(2);
let down_url = args[0];
let targetPath = path.join(process.cwd(), 'data', 'downloads', 'torrent_dump_full.csv.gz');
let tstamp = new Date().toString();

function downloadDump(down_url, targetPath) {
    let received_bytes = 0;
    let total_bytes = 0;

    ensureDirectoryExistence(targetPath);

    let out = fs.createWriteStream(targetPath)
        .on('error', function (err) {
            console.log(err);
            process.send(['upd-dump-failed', 'file']); //mainWindow.webContents.send('upd-dump-failed', 'file');
        })
        .on('open', function () {
            let goodFile = true;
            let req = request({
                method: 'GET',
                uri: down_url
            });

            req.pipe(out);

            req.on('response', function (data) {
                if((data.headers['content-type'].split('/')[0]) !== 'application'){
                    process.send(['upd-dump-failed', 'content']); //mainWindow.webContents.send('upd-dump-failed', 'content');
                    goodFile = false;
                    req.abort();
                }
                tstamp = data.headers['last-modified'];
                total_bytes = parseInt(data.headers['content-length']);
            });
            req.on('data', function (chunk) {
                received_bytes += chunk.length;
                let progress = Math.round((received_bytes * 100) / total_bytes);
                process.send(['upd-dump-update', ['download', progress]]); //mainWindow.webContents.send('upd-dump-update', ['download', progress]);
            });
            req.on('end', function () {
                if (goodFile) {
                    process.send(['upd-dump-success', 'download']); //mainWindow.webContents.send('upd-dump-success', 'download');
                    decompressDump();
                }
            });
            req.on('error', function (err) {
                console.log(err);
                process.send(['upd-dump-failed', 'download']); //mainWindow.webContents.send('upd-dump-failed', 'download');
            });

        });
}

function decompressDump() {
    let extract = path.join(process.cwd(), 'data', 'downloads', 'torrent_dump_full.csv');
    let size;

    fs.stat(targetPath, function (err, data) {
        size = data.size;
    });

    let out = fs.createWriteStream(extract)
        .on('error', function (err) {
            process.send(['upd-dump-failed', 'csv-create']); //mainWindow.webContents.send('upd-dump-failed', 'gz-extract');
            console.log(err);
        })
        .on('open', function () {
            let chLength = 0;
            let read = fs.createReadStream(targetPath)
                .on('data', function (chunk) {
                    chLength += chunk.length;
                    let progress = Math.round((chLength / size) * 100);
                    process.send(['upd-dump-update', ['extract', progress]]); //mainWindow.webContents.send('upd-dump-update', ['extract', progress]);
                })
                .on('end', function () {
                    process.send(['upd-dump-import', [targetPath, extract, tstamp]]); //mainWindow.webContents.send('upd-dump-success', 'extract');
                    process.send(['upd-dump-success', 'extract']); //mainWindow.webContents.send('upd-dump-success', 'extract');
                    process.exit(0);
                })
                .on('error', function (err) {
                    process.send(['upd-dump-failed', 'gz-extract']); //mainWindow.webContents.send('upd-dump-failed', 'gz-extract');
                    console.log(err);
                }).pipe(zlib.createGunzip()).pipe(out);
        });
}

function ensureDirectoryExistence(filePath) {
    let dirname = path.dirname(filePath);
    if (fs.existsSync(dirname)) {
        return true;
    }
    ensureDirectoryExistence(dirname);
    fs.mkdirSync(dirname);
}

downloadDump(down_url, targetPath);