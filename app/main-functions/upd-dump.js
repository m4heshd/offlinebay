const request = require('request');
const fs = require('fs');
const path = require('path');

process.on('uncaughtException', function (error) {
    console.log(error);
    process.send(['upd-dump-failed', 'general']); //mainWindow.webContents.send('upd-dump-failed', 'general');
});

let args = process.argv.slice(2);
let down_url = args[0];
let targetPath = path.join(process.cwd(), 'data', 'downloads', 'torrent_dump_full.csv.gz');

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
                if((data.headers['content-type']) !== 'application/octet-stream'){
                    process.send(['upd-dump-failed', 'content']); //mainWindow.webContents.send('upd-dump-failed', 'content');
                    goodFile = false;
                    req.abort();
                }
                total_bytes = parseInt(data.headers['content-length']);
            });
            req.on('data', function (chunk) {
                received_bytes += chunk.length;
                let progress = Math.round((received_bytes * 100) / total_bytes);
                process.send(['upd-dump-update', progress]); //mainWindow.webContents.send('upd-dump-failed', progress);
            });
            req.on('end', function () {
                if (goodFile) {
                    process.send(['upd-dump-dl-success']); //mainWindow.webContents.send('upd-dump-dl-success');
                }
            });
            req.on('error', function (err) {
                console.log(err);
                process.send(['upd-dump-failed', 'download']); //mainWindow.webContents.send('upd-dump-failed', 'download');
            });

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