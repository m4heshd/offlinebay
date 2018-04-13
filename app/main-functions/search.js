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
let inst = (args[3] === 'true');
count = count > 0 ? count : 100;
count = count > 10000 ? 10000 : count;

console.log(count);
console.log(query);
console.log(inst);

let i = 1;
let reg;
let stream;
let result = [];
let names = [];

let procData = smartSearch;

if (smart) {
    procData = inst ? smartInstSearch : smartSearch;
} else {
    procData = inst ? regularInstSearch : regularSearch;
}

function regularSearch(results, parser) {
    for (let c = 0; c < results.data.length; c++) {
        let record = results.data[c];
        if (record['NAME'].toUpperCase().indexOf(query.toUpperCase()) > -1) {
            if (i > count) {
                parser.abort();
                stream.close();
                break;
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
    }
}

function regularInstSearch(results, parser) {
    let chunk = [];
    let nms = [];
    for (let c = 0; c < results.data.length; c++) {
        let record = results.data[c];
        if (record['NAME'].toUpperCase().indexOf(query.toUpperCase()) > -1) {
            if (i > count) {
                parser.abort();
                stream.close();
                break;
            } else {
                let row = '<tr><td>' + record['#ADDED'] +
                    '</td><td class="d-none">' + record['HASH(B64)'] +
                    '</td><td>' + record['NAME'] +
                    '</td><td>' + formatBytes(record['SIZE(BYTES)'], 1) + '</td></tr>';
                // console.log(i + ' ' + formatBytes(record['SIZE(BYTES)']));
                chunk.push(row);
                nms.push(record['NAME']);
                i++;
            }
        }
    }
    if (chunk.length > 0) {
        process.send(['search-update', {chunk: chunk, names: nms}]); //mainWindow.webContents.send('search-failed', 'process');
    }
}

function smartSearch(results, parser) {
    for (let c = 0; c < results.data.length; c++) {
        let record = results.data[c];
        if (reg.test(record['NAME'])) {
            if (i > count) {
                parser.abort();
                stream.close();
                break;
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
    }
}

function smartInstSearch(results, parser) {
    let chunk = [];
    let nms = [];
    for (let c = 0; c < results.data.length; c++) {
        let record = results.data[c];
        if (reg.test(record['NAME'])) {
            if (i > count) {
                parser.abort();
                stream.close();
                break;
            } else {
                let row = '<tr><td>' + record['#ADDED'] +
                    '</td><td class="d-none">' + record['HASH(B64)'] +
                    '</td><td>' + record['NAME'] +
                    '</td><td>' + formatBytes(record['SIZE(BYTES)'], 1) + '</td></tr>';
                // console.log(i + ' ' + formatBytes(record['SIZE(BYTES)']));
                chunk.push(row);
                // result.push(row);
                nms.push(record['NAME']);
                i++;
            }
        }
    }
    if (chunk.length > 0) {
        process.send(['search-update', {chunk: chunk, names: nms}]); //mainWindow.webContents.send('search-failed', 'process');
    }
}


let finSearch = function () {
    if (inst) {
        process.send(['search-success-inst', {
            resCount: --i
        }]); //mainWindow.webContents.send('search-success-inst');
    } else {
        process.send(['search-success', {
            resCount: --i,
            results: result,
            names: names
        }]); //mainWindow.webContents.send('search-success');
    }

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

function formatBytes(bytes, decimals) {
    if (bytes === 0) return '0 Bytes';
    let k = 1024,
        dm = decimals || 2,
        sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'],
        i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

startSearch(query);