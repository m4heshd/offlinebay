const request = require('request');
const fs = require('fs');
const path = require('path');

// Keep the application from crashing on unexpected errors
process.on('uncaughtException', function (error) {
    console.log(error);
    process.send(['upd-dump-failed', ['general', type]]); //mainWindow.webContents.send('upd-dump-failed', ['general', type]);
});

let args = process.argv.slice(2);
let type = args[0];
let down_url = args[1];
let targetPath = path.join(process.cwd(), 'data', 'downloads', 'torrent_dump_full.csv.gz');
let tstamp = new Date().toString();

// Download the dump file from provided URL
function downloadDump(down_url, targetPath) {
    let received_bytes = 0;
    let total_bytes = 0;
    let goodFile = true;

    ensureDlDir(targetPath);

    let out = fs.createWriteStream(targetPath)
        .on('error', function (err) {
            console.log(err);
            process.send(['upd-dump-failed', ['file', type]]); //mainWindow.webContents.send('upd-dump-failed', ['file', type]);
        })
        .on('open', function () {

            let req = request({
                method: 'GET',
                uri: down_url
            });

            req.pipe(out);

            req.on('response', function (data) {
                if((data.headers['content-type'].split('/')[0]) !== 'application'){
                    process.send(['upd-dump-failed', ['content', type]]); //mainWindow.webContents.send('upd-dump-failed', ['content', type]);
                    goodFile = false;
                    req.abort();
                }
                tstamp = data.headers['last-modified'];
                total_bytes = parseInt(data.headers['content-length']);
            });
            req.on('data', function (chunk) {
                received_bytes += chunk.length;
                let progress = Math.round((received_bytes * 100) / total_bytes);
                process.send(['upd-dump-update', [progress, type]]); //mainWindow.webContents.send('upd-dump-update', [progress, type]);
            });
            req.on('error', function (err) {
                console.log(err);
                process.send(['upd-dump-failed', ['download', type]]); //mainWindow.webContents.send('upd-dump-failed', ['download', type]);
            });

        })
        .on('finish', function () {
            out.close();
            if (goodFile) {
                let final = fs.openSync(targetPath, 'r+');
                let dTstamp = new Date(tstamp);
                fs.futimesSync(final, dTstamp, dTstamp); // Set modified time of the downloaded file to the time from remote file
                fs.fsyncSync(final); // This part is essential to ensure that file is completely written to the disk before extracting
                process.send(['upd-dump-success', [targetPath, tstamp]]); //mainWindow.webContents.send('upd-dump-success', [targetPath, tstamp]);
                process.exit(0);
            }
        });
}

// Make sure the download directory is available before downloading
function ensureDlDir(filePath) {
    let dirname = path.dirname(filePath);
    if (fs.existsSync(dirname)) {
        return true;
    }
    ensureDlDir(dirname);
    fs.mkdirSync(dirname);
}

downloadDump(down_url, targetPath);