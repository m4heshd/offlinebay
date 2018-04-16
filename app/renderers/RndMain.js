const electron = require('electron');
const {ipcRenderer} = electron;

let prefs = {
    usedht: true
};

/* Window Settings
--------------------*/
// Prevent OfflineBay from accepting drag and dropped files by user
document.addEventListener('dragover', event => event.preventDefault());
document.addEventListener('drop', event => event.preventDefault());

/* Window controls
--------------------*/
// Fired on maximization of the main window
ipcRenderer.on('maxed', function () {
    $('#btnMaximize i').removeClass('zmdi-window-maximize').addClass('zmdi-window-restore');
});
// Fired on restoration of the main window
ipcRenderer.on('restored', function () {
    $('#btnMaximize i').removeClass('zmdi-window-restore').addClass('zmdi-window-maximize');
});

// Main window Close button event
$('#btnClose').on('click', function () {
    ipcRenderer.send('app-close');
});
// Main window Minimize button event
$('#btnMinimize').on('click', function () {
    ipcRenderer.send('app-min');
});
// Main window Maximize/Restore button event
$('#btnMaximize').on('click', function () {
    ipcRenderer.send('app-max');
});
/*-----------------------------*/

/* Menu bar
-------------*/
/* Import dump */
$('#mnuImport').on('click', function () {
    ipcRenderer.send('pop-import');
});
// Fired after open dialog is finished on main process
ipcRenderer.on('import-start', function () {
    $("#olAnim").attr("src", "img/import.svg");
    showOL('Validating..');
});
// Fired on each chunk processed by the search process
ipcRenderer.on('import-update', function (event, txt) {
    $('#olText').text('Importing..' + txt + '%');
});
// Fired prior to creating the processed.csv
ipcRenderer.on('import-finalizing', function (event, txt) {
    $('#olText').text('Finalizing..');
});
// Fired after import process is successfully finished
ipcRenderer.on('import-success', function () {
    hideOL();
    popMsg('Dump file imported successfully', 'success')();
    $('#txtStat').text('Dump updated @ ' + moment().format('YYYY-MM-DD hh:mm:ss'));
});
// Fired on any import error
ipcRenderer.on('import-failed', function (event, data) {
    hideOL();
    switch (data) {
        case 'read':
            popMsg('Dump file import failed. Unable to read opened file', 'danger')();
            break;
        case 'temp':
            popMsg('Dump file import failed. Unable to access the staging file', 'danger')();
            break;
        case 'process':
            popMsg('Dump file import failed. Didn\'t process correctly', 'danger')();
            break;
        case 'invalid':
            popMsg('Dump file invalid. Mismatching header', 'danger')();
            break;
        case 'finalize':
            popMsg('Dump file import failed. Unable to create the processed file', 'danger')();
            break;
        default:
            popMsg('Dump file import failed. Unspecified error.', 'danger')();
    }
});

/* Update trackers */
$('#mnuUpdTrcks').on('click', function () {
    $("#olAnim").attr("src", "img/update_trcks.svg");
    showOL('Updating Trackers..');
});

/* Torrent Search
------------------*/
/* Table */
let rows = []; // Global array of table data to be used with all table related functions
// Initiate clusterize on tblMain
let clusterize = new Clusterize({
    rows: rows,
    scrollId: 'tblPane',
    contentId: 'tblMainBody',
    tag: 'tr',
    show_no_data_row: false,
    rows_in_block: 20,
    // blocks_in_cluster: 100
});

// Get markup data from the search result object and push them into an array
function pushTblData(rowdata) {
    let result = [];
    for (let c = 0; c < rowdata.length; c++) {
        result.push(rowdata[c].markup);
    }
    return result;
}

/* Search */
// Initiate search
function startSearch() {
    $("#olAnim").attr("src", "img/load.svg");
    showOL('Searching..');
    let query = $('#txtSearch').val();
    let count = parseInt($('#txtResCount').val());
    let smart = $('#chkSmartSearch').prop('checked');
    let inst = $('#chkInstSearch').prop('checked');
    $('#pnlSeeds').css({
        visibility: 'hidden'
    });

    ipcRenderer.send('search-start', [query, count, smart, inst]);
}

$('#btnSearch').on('click', function () {
    startSearch();
});
// txtSearch and txtResCount Return key event
$('#txtSearch, #txtResCount').keypress(function (e) {
    if (e.which === 13) {
        startSearch();
    }
});
// Fired after validation on main process for running search processes
ipcRenderer.on('search-init', function () {
    rows = [];
    let inst = $('#chkInstSearch').prop('checked');
    if (inst) {
        clusterize.update([]);
        $('#txtFilter').val('');
    }
    $('#txtStat').text('Still searching....');

    $('th[data-sort]').removeAttr('data-sort');
});
// Fired on each processed chunk if user checked instant search to update the table
ipcRenderer.on('search-update', function (event, data) {
    hideOL();
    rows = rows.concat(data);
    let result = pushTblData(data);
    clusterize.append(result);
    clusterize.refresh();
});
// Fired on search errors
ipcRenderer.on('search-failed', function (event, data) {
    hideOL();
    switch (data) {
        case 'read':
            popMsg('Failed to read the dump file. Possible corruption or file doesn\'t exist', 'danger')();
            break;
        case 'process':
            popMsg('Search error. Mismatching data in dump file', 'danger')();
            break;
        default:
            popMsg('Search failed. Unspecified error.', 'danger')();
    }
});
// Fired at the end of search if user didn't check instant search
ipcRenderer.on('search-success', function (event, data) {
    hideOL();
    $('#txtStat').text(data.resCount + ' Results found');
    rows = data.results;
    let result = pushTblData(rows);
    clusterize.update(result);
    clusterize.refresh();
    $('#txtFilter').val('');
});
// Fired at the end of search if user checked instant search
ipcRenderer.on('search-success-inst', function (event, data) {
    hideOL();
    $('#txtStat').text(data.resCount + ' Results found');
});

/* Filtering */
$("#txtFilter").keyup(function () {
    filterTbl();
});

// Filter table using the user input
function filterTbl() {
    let input, filter, smart, results;
    input = document.getElementById("txtFilter");
    filter = input.value.toUpperCase();
    results = [];

    smart = $('#chkSmartSearch').prop('checked');

    if (smart) {
        filter = input.value;
        let reg = new RegExp(regexify(filter), 'i');
        for (let i = 0; i < rows.length; i++) {
            if (reg.test(rows[i].name)) {
                results.push(rows[i].markup);
            }
        }
        clusterize.update(results);
        clusterize.refresh();
    } else {
        for (let i = 0; i < rows.length; i++) {
            if (rows[i].name.toUpperCase().indexOf(filter) > -1) {
                results.push(rows[i].markup);
            }
        }
        clusterize.update(results);
        clusterize.refresh();
    }
}

// Escape Regex special characters in the search query
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

/* Sorting */

$('th[data-role="columnheader"]').on('click', function () {
    sortTbl($(this));
});

// Table sort initiator
function sortTbl(comp) {
    let sort = comp.attr('data-sort');
    if (sort) {
        rows.reverse();
        filterTbl();
        switch (sort) {
            case 'asc':
                comp.attr('data-sort', 'desc');
                break;
            case 'desc':
                comp.attr('data-sort', 'asc');
                break;
        }
    } else {
        let type = comp.data('type');
        switch (type) {
            case 'date':
                rows.sort(function (a, b) {
                    return sortDate(a.added, b.added);
                });
                break;
            case 'name':
                rows.sort(function (a, b) {
                    return sortName(a.name, b.name);
                });
                break;
            case 'size':
                rows.sort(function (a, b) {
                    return sortSize(a.size, b.size);
                });
                break;
        }
        filterTbl();
        $('th[data-sort]').removeAttr('data-sort');
        comp.attr('data-sort', 'asc');
    }
}

// Torrent added Timestamp comparator
function sortDate(a, b) {
    a = new Date(a);
    b = new Date(b);
    return a - b;
}

// Torrent name comparator
function sortName(a, b) {
    return a.trim().localeCompare(b.trim());
}

// Torrent size comparator
function sortSize(a, b) {

    let compareNumber = function (a, b) {
        a = parseFloat(a);
        b = parseFloat(b);

        a = isNaN(a) ? 0 : a;
        b = isNaN(b) ? 0 : b;

        return a - b;
    };

    let cleanNumber = function (i) {
        return i.replace(/[^\-?0-9.]/g, '');
    };

    let suffix2num = function (suffix) {
        suffix = suffix.toLowerCase();
        let base = 1024;

        switch (suffix[0]) {
            case 'k':
                return Math.pow(base, 2);
            case 'm':
                return Math.pow(base, 3);
            case 'g':
                return Math.pow(base, 4);
            case 't':
                return Math.pow(base, 5);
            case 'p':
                return Math.pow(base, 6);
            case 'e':
                return Math.pow(base, 7);
            case 'z':
                return Math.pow(base, 8);
            case 'y':
                return Math.pow(base, 9);
            default:
                return base;
        }
    };

    let filesize2num = function (filesize) {
        let matches = filesize.match(/^(\d+(\.\d+)?) ?((K|M|G|T|P|E|Z|Y|B$)i?B?)$/i);

        let num = parseFloat(cleanNumber(matches[1])),
            suffix = matches[3];

        return num * suffix2num(suffix);
    };

    a = filesize2num(a);
    b = filesize2num(b);

    return compareNumber(a, b);
}

/* Seeds/Peers Scraping
------------------------*/
// Set the seeds and peer count arrays globally to make update, validation and reset easier
let peersDHT = 0;
let seeds = [];
let peers = [];

// Event for double click on any row inside the body of tblMain
$("#tblMainBody").on('dblclick', 'tr', function () {
    let hash = $(':nth-child(2)', this).html().trim();
    // console.log(hash);
    ipcRenderer.send('scrape-start', [hash, prefs.usedht]);

});
// Fired after validation for Scrape process
ipcRenderer.on('scrape-init', function (event, data) {
    peersDHT = 0;
    seeds = [];
    prefs.usedht ? peers = [0] : peers = [];
    $('#lblSeeds').text('0');
    $('#lblPeers').text('0');
    $('.imgDots').css({
        visibility: 'visible'
    });
    $('#pnlSeeds').css({
        visibility: 'visible'
    });
});
// Fired on each tracker that's successfully scraped
ipcRenderer.on('scrape-update', function (event, data) {
    seeds.push(data.complete);
    peers.push(data.incomplete);
    seeds.sort(function (a, b) {
        return b - a;
    });
    peers.sort(function (a, b) {
        return b - a;
    });
    let totPeers = peers[0] + peersDHT;
    $('#lblSeeds').text(seeds[0]);
    $('#lblPeers').text(totPeers);
});
// Fired on each peer found on DHT
ipcRenderer.on('scrape-update-DHT', function () {
    peers.sort(function (a, b) {
        return b - a;
    });
    let totPeers = peers[0] + ++peersDHT;
    $('#lblPeers').text(totPeers);
});
// Fired on errors when scraping
ipcRenderer.on('scrape-failed', function () {
    popMsg('Failed to read the dump file. Possible corruption or file doesn\'t exist', 'danger')();
});
// Fired after the exit of scraper process
ipcRenderer.on('scrape-end', function () {
    $('.imgDots').css({
        visibility: 'hidden'
    });
    if (!seeds.length){
        popMsg('Possible error trying to retrieve Seeds/Peers count. Check your internet connection', 'danger')();
    }
});

/* Overlay
-------------*/
ipcRenderer.on('hide-ol', function () {
    hideOL();
});

// Show the dark window overlay with provided text
function showOL(text) {
    $('#olText').text(text);
    $('#overlay').css({
        visibility: 'visible',
        opacity: 1
    });
}

// Hide window overlay
function hideOL() {
    $('#overlay').css({
        opacity: 0,
        visibility: 'hidden'
    });
}

$('#overlay').on('click', function () {
    hideOL();
});

/* Notification popups
-------------------------*/
// Fired on 'notify' event with message text and type from the main process. Then shows a notification.
ipcRenderer.on('notify', function (event, msg) {
    popMsg(msg[0], msg[1])();
});

// Notification popup closure
function popMsg(txt, type) {
    return function () {
        $.notify({
            message: txt
        }, {
            type: type,
            placement: {
                from: 'bottom',
                align: 'right'
            },
            animate: {
                enter: 'animated fadeInUp',
                exit: 'animated fadeOutDown'
            },
            template: '<div data-notify="container" class="col-xs-11 col-sm-4 alert alert-{0}" role="alert">\n' +
            '    <button type="button" aria-hidden="true" class="close" data-notify="dismiss">&times;</button>\n' +
            '    <span data-notify="icon"></span> \n' +
            '    <span data-notify="title">{1}</span> \n' +
            '    <span data-notify="message" style="vertical-align: middle">{2}</span>\n' +
            '    <div class="progress" data-notify="progressbar">\n' +
            '        <div class="progress-bar progress-bar-{0}" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100" style="width: 0%;">\n' +
            '        </div>\n' +
            '    </div>\n' +
            '    <a href="{3}" target="{4}" data-notify="url"></a>\n' +
            '</div>'
        });
    }
}

$(document).ready(function () {
    $('#btnOpenMag').on('click', popMsg('Magnet link opened in the default application', 'info'));
});
