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

let i = 1;
let reg;
let stream;
let result = [];

// Takes a database record and returns a search result object to be displayed
function resultObjectTemplate(record) {
    let size = formatBytes(record['SIZE(BYTES)'], 1);
    let row = '<tr><td>' + record['#ADDED'] +
        '</td><td class="d-none">' + record['HASH(B64)'] +
        '</td><td>' + record['NAME'] +
        '</td><td>' + size + '</td></tr>';
    return {
        added: record['#ADDED'],
        name: record['NAME'],
        size: size,
        markup: row
    };
}

// Returns true of false for DB record based on regular search terms
function regularCondition(record) {
    return record['NAME'] && record['NAME'].toUpperCase().indexOf(query.toUpperCase()) > -1;
}

// Returns true of false for DB record based on smart search terms
function smartCondition(record) {
    return reg.test(record['NAME']);
}

// Processes and searches each chunk of DB as it is read into memory
function procData(results, parser) {
    var condition = smart ? smartCondition : regularCondition;

    for (let c = 0; c < results.data.length; c++) {
        let record = results.data[c];

        if (condition(record)) {
            if (i > count) {
                parser.abort();
                stream.close();
                break;
            } else {
                result.push(resultObjectTemplate(record));
                i++;
            }
        }
    }

    if (inst && result.length > 0) {
        process.send(['search-update', result]); //mainWindow.webContents.send('search-update', result);
        result = [];
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
            results: result
        }]); //mainWindow.webContents.send('search-success');
    }

    process.exit(0);
};


function search() {

    stream = fs.createReadStream(path.join(process.cwd(), 'data', 'processed.csv'))
        .once('open', function () {
            papa.parse(stream, {
                delimiter: ';',
                escapeChar: '\\',
                header: true,
                chunk: procData,
                complete: finSearch,
                error: function (error) {
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
    if (text.length) {
        search();
    }
    process.send(['search-failed', 'no-text']);
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