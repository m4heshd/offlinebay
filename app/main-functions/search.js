const fs = require('fs');
const path = require('path');
const papa = require('papaparse');

process.on('uncaughtException', function (error) {
    console.log(error);
    process.send(['search-failed', 'general']); //mainWindow.webContents.send('search-failed', 'general');
});

let args = process.argv.slice(2);
let query = args[0];
let count = parseInt(args[1]);
let smart = (args[2] === 'true');
count = count > 0 ? count : 100;
count = count > 10000 ? 10000 : count;

console.log(count);
console.log(query);
console.log(smart);

let i = 1;
let reg;
let stream;
let result = [];
let names = [];

let procData = smart ? smartSearch : regularSearch;

function regularSearch(results, parser) {
    let stop = false;
    results.data.forEach(function (record) {
        // console.log(record['NAME']);
        if (record['NAME'].toUpperCase().indexOf(query.toUpperCase()) > -1) {
            if (i > count) {
                if (!stop) {
                    parser.abort();
                    stream.close();
                }
                stop = true;
            } else {
                let row = '<tr><td>' + record['#ADDED'] +
                    '</td><td class="d-none">' + record['HASH(B64)'] +
                    '</td><td>' + record['NAME'] +
                    '</td><td>' + formatBytes(record['SIZE(BYTES)'], 1) + '</td></tr>';
                // console.log(i + ' ' + formatBytes(record['SIZE(BYTES)']));
                result.push(row);
                names.push(record['NAME']);
                i++;
            }
        }
    });
}

function smartSearch(results, parser) {
    let stop = false;
    results.data.forEach(function (record) {
        // console.log(record['NAME']);
        if (record['NAME'].match(reg)) {
            if (i > count) {
                if (!stop) {
                    parser.abort();
                    stream.close();
                }
                stop = true;
            } else {
                let row = '<tr><td>' + record['#ADDED'] +
                    '</td><td class="d-none">' + record['HASH(B64)'] +
                    '</td><td>' + record['NAME'] +
                    '</td><td>' + formatBytes(record['SIZE(BYTES)'], 1) + '</td></tr>';
                 // console.log(i + ' ' + formatBytes(record['SIZE(BYTES)']));
                result.push(row);
                names.push(record['NAME']);
                i++;
            }
        }
    });
}

let finSearch = function () {
    process.send(['search-success', {
        resCount: --i,
        results: result,
        names: names
    }]); //mainWindow.webContents.send('search-failed', 'process');
    console.log(process.uptime());
    process.exit(0);
};


function search() {

    stream = fs.createReadStream(path.join(process.cwd(), 'data', 'processed.csv'))
        .once('open', function () {
            papa.parse(stream, {
                // fastMode: true,
                delimiter: ';',
                escapeChar: '\\',
                header: true,
                chunk: procData,
                complete: finSearch,
                error: function (error, file) {
                    process.send(['search-failed', 'process']); //mainWindow.webContents.send('search-failed', 'process');
                    console.log(error);
                }
            });
        })
        .on('error', function (err) {
            process.send(['search-failed', 'read']); //mainWindow.webContents.send('search-failed', 'read');
            console.log(err);
        });

}


function startSearch(text) {
    reg = new RegExp(regexify(text), 'i');
    search();
}

function escapeRegExp(text) {
    return text.replace(/[-[\]{}()*+?.,\\/^$|#\s]/g, '\\$&');
}

function regexify(text) {
    text = text.trim().replace(/(\s+)/g, ' ');
    let words = text.split(' ');
    let final = '';
    words.forEach(function (item) {
        final += '(?=.*' + escapeRegExp(item) + ')';
    });
    return final;
}

function formatBytes(bytes,decimals) {
    if(bytes === 0) return '0 Bytes';
    let k = 1024,
        dm = decimals || 2,
        sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'],
        i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

startSearch(query);