const electron = require('electron');
const {ipcRenderer, clipboard, shell} = electron;
const path = require('path');
const fs = require('fs');
const Datastore = require('nedb');

let prefs = {
    sysTray: false,
    useDHT: true,
    // updURL: 'https://thepiratebay.org/static/dump/csv/torrent_dump_2007.csv.gz',
    trckURL: 'https://newtrackon.com/api/stable',
    updURL: 'http://127.0.0.1/tpb/torrent_dump_full.csv.gz',
    updLast: '2017-01-07T11:44:34.000Z',
    updType: 'off',
    updInt: 20,
    updStat: ['complete', '', ''],
    theme: 'default'
};

/* DB functions
--------------------*/
// Load all preferences related to renderer from config.db
function loadPrefs() {
    let config = new Datastore({
        filename: path.join(__dirname, 'data', 'config.db'),
        autoload: true
    });
    let themeDB = new Datastore({
        filename: path.join(__dirname, 'data', 'themes', 'themes.db'),
        autoload: true
    });

    config.findOne({type: 'gen'}, function (err, pref) {
        if (!err && pref) {
            prefs.sysTray = pref.sysTray;
            prefs.useDHT = pref.useDHT;
        } else {
            popMsg('Unable to read preferences from config DB', 'danger')();
        }
    });

    config.findOne({type: 'search'}, function (err, pref) {
        if (!err && pref) {
            $('#txtResCount').val(pref.rs_count.toString());
            $('#chkSmartSearch').prop('checked', pref.smart);
            $('#chkInstSearch').prop('checked', pref.inst);
            ipcRenderer.send('pref-change', ['rs_count', pref.rs_count]);
            ipcRenderer.send('pref-change', ['smart', pref.smart]);
            ipcRenderer.send('pref-change', ['inst', pref.inst]);
        } else {
            popMsg('Unable to read preferences from config DB', 'danger')();
        }
    });

    config.findOne({type: 'trackers'}, function (err, trck) {
        if (!err && trck) {
            prefs.trckURL = trck.url;
            allTrackers = trck.trackers;
        } else {
            popMsg('Unable to read preferences from config DB', 'danger')();
        }
    });

    config.findOne({type: 'dump'}, function (err, dmp) {
        if (!err && dmp) {
            prefs.updURL = dmp.updURL;
            prefs.updLast = dmp.updLast;
            prefs.updType = dmp.updType;
            prefs.updInt = dmp.updInt;
            prefs.updStat = dmp.updStat;
            ipcRenderer.send('pref-change', ['updLast', dmp.updLast]);

            if (prefs.updType === 'auto' || prefs.updType === 'notify') {
                startAutoDump();
            }

        } else {
            popMsg('Unable to read preferences from config DB', 'danger')();
        }
    });

    themeDB.findOne({applied: true}, function (err, theme) {
        if (!err && theme) {
            prefs.theme = theme.name;
            setTitleImg(prefs.theme);
        } else {
            popMsg('Unable to load current theme from DB', 'danger')();
        }
    });
}
loadPrefs();

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
    ipcRenderer.send('app-close', prefs.sysTray);
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

/* Initial settings
--------------------*/
ipcRenderer.on('set-version', function (event, data) {
    $('#txtAppVersion').text('Software version : ' + data);
}); // Set application version on about dialog

/* Menu bar
-------------*/
/* Import dump */
$('#mnuImport').on('click', function () {
    ipcRenderer.send('pop-import');
});
// Fired after open dialog is finished on main process or dump download is successful
ipcRenderer.on('import-start', function () {
    $("#olAnim").attr("src", "img/import.svg");
    showOL('Setting up..');
});
// Fired before the validation process start on import process
ipcRenderer.on('import-validate', function () {
    $('#olText').text('Validating..');
});
// Fired on each chunk processed or extracted by the import process
ipcRenderer.on('import-update', function (event, data) {
    switch (data[0]) {
        case 'import':
            $('#olText').text('Importing..' + data[1] + '%');
            break;
        case 'extract':
            $('#olText').text('Extracting..' + data[1] + '%');
            break;
    }
});
// Fired prior to creating the processed.csv and clean up
ipcRenderer.on('import-finalizing', function (event, txt) {
    $('#olText').text('Finalizing..');
});
// Fired after import process is successfully finished
ipcRenderer.on('import-success', function (event, data) {
    prefs.updLast = new Date(data).toISOString();
    ipcRenderer.send('pref-change', ['updLast', prefs.updLast]);
    prefs.updStat[0] = 'complete';
    hideOL();
    popMsg('Dump file imported successfully', 'success')();
    $('#txtStat').text('Dump updated @ ' + moment().format('YYYY-MM-DD hh:mm:ss'));
    $('#txtStatRight').css('visibility', 'hidden');
    setStatTxt('An update is available..');
    let ntf = new Notification('OfflineBay Dump update', {
        body: 'A new Dump update was imported',
        icon: path.join(__dirname, 'img', 'icon_noshadow_48.png')
    });
    ntf.onclick = function (evt) {
        evt.preventDefault();
        ipcRenderer.send('show-win');
    }
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
        case 'csv-create':
            popMsg('Failed to extract dump. Unable to create csv file', 'danger')();
            break;
        case 'gz-extract':
            popMsg('Failed to extract dump. Unable to read downloaded file', 'danger')();
            break;
        case 'after-extract':
            popMsg('Failed to import. Unable to access extracted file', 'danger')();
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

/* Update dump */
$('#mnuCheckUpdDump').on('click', function () {
    $("#olAnim").attr("src", "img/update_check.svg");
    showOL('Checking..');
    setStatTxt('Checking for updates..');
    ipcRenderer.send('upd-dump', [prefs.updURL, 'check']); // [URL, <type>]
});
// Fired on system tray update check menu click
ipcRenderer.on('upd-check-tray', function () {
    if (prefs.updType !== 'off') {
        stopAutoDump();
        startAutoDump();
    }
    setStatTxt('Checking for updates..');
    ipcRenderer.send('upd-dump', [prefs.updURL, 'tray']); // [URL, <type>]
});
// Fired after dump update is checked and none available
ipcRenderer.on('upd-check-unavail', function (event, data) {
    if (data === 'check') {
        hideOL();
        popMsg('Your dump file is up to date', 'success')();
    } else {
        $('#txtStatRight').css('visibility', 'hidden');
    }
});
// Fired after dump update is checked and only if the update type is 'notify'
ipcRenderer.on('upd-check-notify', function () {
    setStatTxt('An update is available..');
    let ntf = new Notification('OfflineBay Dump update', {
        body: 'A new Dump update is available. Click to download',
        icon: path.join(__dirname, 'img', 'icon_noshadow_48.png')
    });
    ntf.onclick = function (evt) {
        evt.preventDefault();
        ipcRenderer.send('show-win');
        showOL('Looking up..');
        ipcRenderer.send('upd-dump', [prefs.updURL, 'user']);
    }
});
// Fired on any dump update check error
ipcRenderer.on('upd-check-failed', function (event, data) {
    if (data[1] === 'check') {
        hideOL();
        switch (data[0]) {
            case 'download':
                popMsg('Failed to check updates. Check your internet connection and URL', 'danger')();
                break;
            case 'content':
                popMsg('Failed to check updates. Try a mirror URL', 'danger')();
                break;
            default:
                popMsg('Failed to check updates. Unknown error', 'danger')();
        }
    } else {
        switch (data[0]) {
            case 'download':
                setStatErr('Failed to check updates. Check your internet connection and URL');
                break;
            case 'content':
                setStatErr('Failed to check updates. Try a mirror URL');
                break;
            default:
                setStatErr('Failed to check updates. Unknown error');
        }
    }
});
$('#mnuUpdDump').on('click', function () {
    $("#olAnim").attr("src", "img/import.svg");
    showOL('Looking up..');
    ipcRenderer.send('upd-dump', [prefs.updURL, 'user']);
});
// Fired after checking for updates (only if user forced to check updates)
ipcRenderer.on('upd-dump-init', function (event, data) {
    if (data === 'user') {
        $("#olAnim").attr("src", "img/import.svg");
        showOL('Initializing Download..');
    } else {
        setStatTxt('Update available. Initializing download..');
    }
});
// Fired on each chunk downloaded by the dump update process
ipcRenderer.on('upd-dump-update', function (event, data) {
    if (data[1] === 'user') {
        $('#olText').text('Downloading..' + data[0] + '%');
    } else {
        setStatTxt('Downloading Update..' + data[0] + '%');
    }
});
// Fired after dump file is successfully downloaded
ipcRenderer.on('upd-dump-success', function (event, data) {
    prefs.updStat = ['downloaded', data[0], data[1]];
    setStatTxt('Update Downloaded..');
    ipcRenderer.send('upd-import', data);
});
// Fired on any dump update error
ipcRenderer.on('upd-dump-failed', function (event, data) {
    if (data[1] === 'user') {
        hideOL();
        switch (data[0]) {
            case 'file':
                popMsg('Failed to download update. Unable to create the file', 'danger')();
                break;
            case 'download':
                popMsg('Failed to download update. Check your internet connection and URL', 'danger')();
                break;
            case 'content':
                popMsg('Failed to download update. File unavailable. Try a mirror URL', 'danger')();
                break;
            default:
                popMsg('Failed to update dump. Unknown error', 'danger')();
        }
    } else {
        switch (data[0]) {
            case 'file':
                setStatErr('Failed to download update. Unable to create the file');
                break;
            case 'download':
                setStatErr('Failed to download update. Check your internet connection and URL');
                break;
            case 'content':
                setStatErr('Failed to download update. File unavailable. Try a mirror URL');
                break;
            default:
                setStatErr('Failed to update dump. Unknown error');
        }
    }
});

/* Update trackers */
$('#mnuUpdTrcks').on('click', function () {
    $("#olAnim").attr("src", "img/update_trcks.svg");
    showOL('Updating Trackers..');
    ipcRenderer.send('upd-trackers');
});
// Fired after trackers are successfully updated
ipcRenderer.on('upd-trackers-success', function (event, data) {
    hideOL();
    popMsg('Trackers were updated successfully', 'success')();
    allTrackers = data;
    $('#txtStat').text('Trackers updated @ ' + moment().format('YYYY-MM-DD hh:mm:ss'));
});
// Fired on any tracker update error
ipcRenderer.on('upd-trackers-failed', function (event, data) {
    hideOL();
    switch (data) {
        case 'ep':
            popMsg('Failed to update trackers. Unable to retrieve URL from DB', 'danger')();
            break;
        case 'net':
            popMsg('Failed to update trackers. Check your internet connection and URL', 'danger')();
            break;
        case 'empty':
            popMsg('Failed to update trackers. Response is empty', 'danger')();
            break;
        case 'update':
            popMsg('Failed to update trackers. Unable to update the DB', 'danger')();
            break;
        default:
            popMsg('Failed to update trackers. Unknown error', 'danger')();
    }
});

/* Show all trackers */
$('#mnuAllTrcks').on('click', function () {
    let rows = '';
    for (let c = 0; c < allTrackers.length; c++) {
        rows += '<tr><td>' + allTrackers[c] + '</td></tr>';
    }
    $('#tblTrckBody').html(rows);
});

/* Preferences Window */
$('#mnuPrefs').on('click', function () {
    setPrefsWindow();
});

/* Themes Window */
$('#mnuThemes').on('click', function () {
    loadThemes();
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
// txtSearch Return key event
$('#txtSearch').keypress(function (e) {
    if (e.which === 13) {
        startSearch();
    }
});
// txtResCount validation and Return key event
$('#txtResCount').keypress(function (e) {
    let charCode = (e.which) ? e.which : e.keyCode;
    if (charCode === 13) {
        startSearch();
    }
    return !(charCode > 31 && (charCode < 48 || charCode > 57));
}).on('paste',function (e) {
    e.preventDefault();
}).on('input',function (e) {
    let count = parseInt($(this).val());
    if (count > 10000) {
        $(this).val('10000');
        ipcRenderer.send('pref-change', ['rs_count', 10000]);
    } else if (count < 1 || !count) {
        $(this).val('1');
        $(this).select();
        ipcRenderer.send('pref-change', ['rs_count', 1]);
    } else {
        ipcRenderer.send('pref-change', ['rs_count', count]);
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

/* Search options */
$('#chkSmartSearch').on('change', function () {
    ipcRenderer.send('pref-change', ['smart', $(this).prop('checked')]);
});
$('#chkInstSearch').on('change', function () {
    ipcRenderer.send('pref-change', ['inst', $(this).prop('checked')]);
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
let allTrackers = []; // To hold all trackers from DB
let bestTrackers = []; // To hold trackers sorted from best to worst

// Event for double click on any row inside the body of tblMain
$("#tblMainBody").on('dblclick', 'tr', function () {
    let hash = $(':nth-child(2)', this).html().trim();
    ipcRenderer.send('scrape-start', [hash, prefs.useDHT]);

});
// Fired after validation for Scrape process
ipcRenderer.on('scrape-init', function (event, data) {
    peersDHT = 0;
    seeds = [];
    bestTrackers = [];
    prefs.useDHT ? peers = [0] : peers = [];
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
    bestTrackers.push(data);
    bestTrackers.sort(function (a, b) {
        return b.complete - a.complete;
    });
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
// Fired on warnings when scraping
ipcRenderer.on('scrape-warn', function (event, data) {
    switch (data){
        case 'empty':
            popMsg('No Trackers found. Try updating trackers or re-installing OfflineBay', 'warning')();
            break;
        case 'db':
            popMsg('Unable to retrieve trackers from DB. Please re-install OfflineBay', 'warning')();
            break;
    }
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

/* Magnet and Info hash
------------------------*/
$('#btnHash').on('click', function () {
    let selected = $('#tblMainBody .active');
    if (selected.length > 0) {
        let base64Hash = $(':nth-child(2)', selected).html().trim();
        clipboard.writeText(getInfoHash(base64Hash));
        popMsg('Info Hash copied to clipboard', 'info')();
    } else {
        popMsg('Please select a torrent to get the Info Hash', 'warning')();
    }
});

$('#btnCopyMag').on('click', function () {
    let selected = $('#tblMainBody .active');
    if (selected.length > 0) {
        let base64Hash = $(':nth-child(2)', selected).html().trim();
        let name = $(':nth-child(3)', selected).html().trim();
        clipboard.writeText(getMagnetLink(base64Hash, name));
        popMsg('Magnet link copied to clipboard', 'info')();
    } else {
        popMsg('Please select a torrent to get the Magnet link', 'warning')();
    }
});

$('#btnOpenMag').on('click', function () {
    let selected = $('#tblMainBody .active');
    if (selected.length > 0) {
        let base64Hash = $(':nth-child(2)', selected).html().trim();
        let name = $(':nth-child(3)', selected).html().trim();
        let magnet = getMagnetLink(base64Hash, name);
        shell.openExternal(magnet, {}, function (err) {
            if (err) {
                popMsg('Unable to open the Magnet link', 'danger')();
            }else {
                popMsg('Magnet link opened in default Torrent client', 'info')();
            }
        },);
    } else {
        popMsg('Please select a torrent to open the Magnet link', 'warning')();
    }
});

$('#btnGoogle').on('click', function () {
    let selected = $('#tblMainBody .active');
    if (selected.length > 0) {
        let base64Hash = $(':nth-child(2)', selected).html().trim();
        let search = 'http://www.google.com/search?q=' + urlencode(getInfoHash(base64Hash));
        openLink(search);
        popMsg('Search opened in the browser', 'info')();
    } else {
        popMsg('Please select a torrent to Google search', 'warning')();
    }
});

function getMagnetLink(base64, name) {
    let base = 'magnet:?xt=urn:btih:' + getInfoHash(base64);
    let withname = base + '&dn=' + urlencode(name);
    if (bestTrackers.length > 4){
        for (let c = 0; c < 5; c++) {
            withname = withname + '&tr=' + urlencode(bestTrackers[c].announce)
        }
    } else {
        if (allTrackers.length > 0) {
            let i = allTrackers.length > 4 ? 5 : allTrackers.length;
            allTrackers.sort(function(a, b){return 0.5 - Math.random()});
            for (let c = 0; c < i; c++) {
                withname = withname + '&tr=' + urlencode(allTrackers[c])
            }
        } else {
            popMsg('No trackers were found. Magnet link won\'t contain any trackers. Try updating trackers', 'warning')();
        }
    }
    return withname;
}

function getInfoHash(base64) {
    let raw = atob(base64);
    let HEX = '';
    for (let i = 0; i < raw.length; i++) {
        let _hex = raw.charCodeAt(i).toString(16)
        HEX += (_hex.length == 2 ? _hex : '0' + _hex);
    }
    return HEX.toUpperCase();
}

function urlencode(text) {
    return encodeURIComponent(text).replace(/!/g,  '%21')
        .replace(/'/g,  '%27')
        .replace(/\(/g, '%28')
        .replace(/\)/g, '%29')
        .replace(/\*/g, '%2A')
        .replace(/%20/g, '+');
}

/* External Links
------------------*/
$('#ttLogoMain, #ttLogoAbout, #mnuContact').on('click', function () {
    openLink('https://www.youtube.com/c/techtac?sub_confirmation=1');
});
$('#ttPatreon').on('click', function () {
    openLink('https://www.patreon.com/techtac');
});
$('#ttFB').on('click', function () {
    openLink('https://www.facebook.com/techtacoriginal');
});
$('#ttTwitter').on('click', function () {
    openLink('https://twitter.com/techtacoriginal');
});

function openLink(link) {
    shell.openExternal(link, {}, function (err) {
        if (err) {
            popMsg('Unable to open the link', 'danger')();
        }
    });
}

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

/* All trackers window
------------------------*/
$('#btnCopyTrck').on('click', function () {
    let selected = $('#tblTrckBody .active');
    if (selected.length > 0) {
        let tracker = $('td', selected).html().trim();
        clipboard.writeText(tracker);
        popMsg('Tracker copied to clipboard', 'info')();
    } else {
        popMsg('Please select a Tracker to copy', 'warning')();
    }
});
$('#btnCopyAllTrck').on('click', function () {
    if (allTrackers.length > 0) {
        clipboard.writeText(allTrackers.join('\n'));
        popMsg('All Trackers copied to clipboard', 'info')();
    } else {
        popMsg('No Trackers to copy. Try updating Trackers', 'warning')();
    }
});

/* Preferences window
------------------------*/
$('#btnSavePrefs').on('click', function () {
    savePrefs();
});

// Set current values to preferences window components
function setPrefsWindow(){
    $('#chkTray').prop('checked', prefs.sysTray);
    $('#txtTrckURL').removeClass('txtinvalid').val(prefs.trckURL);
    $('#chkDHT').prop('checked', prefs.useDHT);
    $('#txtDumpURL').removeClass('txtinvalid').val(prefs.updURL);
    $('#rdoUpdType input[value="' + prefs.updType + '"]').prop('checked', true);
    $('#txtUpdInt').val(prefs.updInt);
    $('#txtLastUpd').text(prefs.updLast);
    $('#btnSavePrefs').prop('disabled',false);
}

// Save settings to DB from Preferences window
function savePrefs(){
    prefs.sysTray = $('#chkTray').prop('checked');
    prefs.trckURL = $('#txtTrckURL').val();
    prefs.useDHT = $('#chkDHT').prop('checked');
    prefs.updURL = $('#txtDumpURL').val();
    prefs.updType = $('#rdoUpdType input[name="dmpUpdType"]:checked').val();
    prefs.updInt = parseInt($('#txtUpdInt').val());

    ipcRenderer.send('save-rnd-prefs', prefs);

    if (prefs.updType === 'auto' || prefs.updType === 'notify') {
        startAutoDump();
    } else {
        stopAutoDump();
    }
}

// txtUpdInt validation
$('#txtUpdInt').keypress(function (e) {
    let charCode = (e.which) ? e.which : e.keyCode;
    return !(charCode > 31 && (charCode < 48 || charCode > 57));
}).on('paste',function (e) {
    e.preventDefault();
}).on('input',function (e) {
    let count = parseInt($(this).val());
    if (count > 1440) {
        $(this).val('1440');
    } else if (count < 10 || !count) {
        $(this).val('10');
    }
});

$('#txtTrckURL, #txtDumpURL').on('paste',function (e) {
    validatePrefs();
}).on('input',function (e) {
    validatePrefs();
});

// Validate all URLs and enable or disable the save button
function validatePrefs() {
    let txtTrck = $('#txtTrckURL');
    let txtDmp = $('#txtDumpURL');
    let trckVal = isUrlValid(txtTrck.val());
    let dmpVal = isUrlValid(txtDmp.val());

    if(trckVal){
        txtTrck.removeClass('txtinvalid');
        if (dmpVal) {
            txtDmp.removeClass('txtinvalid');
            $('#btnSavePrefs').prop('disabled',false);
        } else {
            txtDmp.addClass('txtinvalid');
            $('#btnSavePrefs').prop('disabled',true);
        }
    } else {
        txtTrck.addClass('txtinvalid');
        $('#btnSavePrefs').prop('disabled',true);
        if (dmpVal) {
            txtDmp.removeClass('txtinvalid');
        } else {
            txtDmp.addClass('txtinvalid');
        }
    }
}

// Validate URLs
function isUrlValid(url) {
    let valid = url.match(/^(https?|ftp):\/\/(((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:)*@)?(((\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\.(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\.(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\.(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5]))|((([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.)+(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.?)(:\d*)?)(\/((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)+(\/(([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)*)*)?)?(\?((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)|[\uE000-\uF8FF]|\/|\?)*)?(\#((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)|\/|\?)*)?$/i);
    return valid != null;
}

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
            z_index: 1051,
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

/* Status text on right side
-----------------------------*/
$('#txtStatRight').on('click', function () {
    $(this).css('visibility', 'hidden');
});
ipcRenderer.on('hide-stat', function () {
    $('#txtStatRight').css('visibility', 'hidden');
});
function setStatTxt(txt) {
    let lbl = $('#txtStatRight');
    lbl.css('color', 'inherit');
    lbl.css('visibility', 'visible');
    lbl.text(txt);
}
function setStatErr(txt) {
    let lbl = $('#txtStatRight');
    lbl.css('color', 'red');
    lbl.css('visibility', 'visible');
    lbl.text(txt);
}

/* Dump updates
----------------*/
/* Auto update */
let dmpTimer;

// Set an interval to the dmpTimer variable
function startAutoDump() {
    dmpTimer = setInterval(function () {
        if (prefs.updStat[0] === 'downloaded') {
            setStatTxt('Update Downloaded..');
            ipcRenderer.send('upd-import', [prefs.updStat[1], prefs.updStat[2]]);
        } else {
            setStatTxt('Checking for updates..');
            ipcRenderer.send('upd-dump', [prefs.updURL, prefs.updType]); // [URL, <type>]
        }
    }, (prefs.updInt * 60) * 1000);
}

// Clear dmpTimer interval
function stopAutoDump(){
    clearInterval(dmpTimer);
}

/* Themes
----------*/
$(".themes-tiles").on('click', '.btn-theme-apply', function () {
    applyTheme($(this).data('thm-name'));
});

function loadThemes() {
    let themeDB = new Datastore({
        filename: path.join(__dirname, 'data', 'themes', 'themes.db'),
        autoload: true
    });

    themeDB.find({}, function (err, themes) {
        if (!err && themes) {
            if (themes.length > 0) {
                showThemesWin(themes);
            }
        } else {
            popMsg('Unable to load themes from DB', 'danger')();
        }
    });
}

function showThemesWin(themes) {
    let tile = '';
    let styles = '';

    for (let c = 0; c < themes.length; c++) {
        let name = themes[c].name;
        let palette = themes[c].palette;

        styles += `.thm-${name}-bg {
                        background: ${palette.bodyBg};
                   }
                   .thm-${name}-title {
                        color: ${palette.bodyTxt};
                   }
                   .thm-${name}-btn {
                       background: ${palette.compclr};
                       color: ${palette.btnTxtClr};
                       box-shadow: 0 0 14px 1px ${palette.btnFocusGlow};
                   }
                   .thm-${name}-btn:hover {
                       background: ${palette.btnBgHover};
                       color: ${palette.btnTxtHover};
                   }
                   .thm-${name}-btn.disabled, .thm-${name}-btn:disabled {
                        color: ${palette.btnTxtClr};
                        background-color: ${palette.btnBgDisable};
                        border-color: ${palette.btnBorderDisable};
                    }
                   .thm-${name}-btn:not(:disabled):not(.disabled):active {
                       background: ${palette.btnActive};
                       color: ${palette.btnTxtHover};
                   }
                   .thm-${name}-btn:focus, .thm-${name}-btn:not(:disabled):not(.disabled):active:focus {
                       box-shadow: 0 0 0 0.2rem ${palette.btnFocusGlow};
                   }`;

        let btnTxt = 'Apply';
        let btnIcon = 'zmdi-palette';
        let btnDisable = '';
        if (themes[c].applied){
            btnTxt = 'Applied';
            btnIcon = 'zmdi-check';
            btnDisable = 'disabled';
        }

        tile += `<div class="theme-prev-bg item-v-center thm-${name}-bg">
                            <div class="theme-prev-content">
                                <span class="thm-${name}-title">${themes[c].title}</span>
                                <button class="btn-ui btn-themed btn-theme-apply thm-${name}-btn" type="button" data-thm-name="${name}" ${btnDisable}>
                                    <i class="zmdi ${btnIcon} btn-ico"></i>
                                    ${btnTxt}
                                </button>
                                <button class="btn-ui btn-themed btn-theme-del thm-${name}-btn" type="button">
                                    <i class="zmdi zmdi-delete btn-ico"></i>
                                </button>
                            </div>
                        </div> <!-- A theme tile -->`
    }

    $("#themeStyles").empty().text(styles);
    $('#pnlThemeTiles').empty().append(tile);
}

function applyTheme(thmName) {
    let themeDB = new Datastore({
        filename: path.join(__dirname, 'data', 'themes', 'themes.db'),
        autoload: true
    });

    themeDB.findOne({name: thmName}, function (err, theme) {
        if (!err && theme) {
            let palette = theme.palette;

            let css = `/* Theme color variables
                       -------------------------*/
                       :root{
                           --bodyTxt : ${palette.bodyTxt};
                           --bodyBg : ${palette.bodyBg};
                           --compclr : ${palette.compclr};
                           --txtFocusBg : ${palette.txtFocusBg};
                           --txtFocustxt : ${palette.txtFocustxt};
                           --txtFocusPH : ${palette.txtFocusPH};
                           --btnTxtClr : ${palette.btnTxtClr};
                           --btnTxtHover : ${palette.btnTxtHover};
                           --btnBgHover : ${palette.btnBgHover};
                           --btnFocusGlow : ${palette.btnFocusGlow};
                           --btnActive : ${palette.btnActive};
                           --btnTxtDisable : ${palette.btnTxtDisable};
                           --btnBgDisable : ${palette.btnBgDisable};
                           --btnBorderDisable : ${palette.btnBorderDisable};
                           --chkChecked : ${palette.chkChecked};
                           --chkUnchecked : ${palette.chkUnchecked};
                           --tblHeadBottomBorder : ${palette.tblHeadBottomBorder};
                           --tblHeadHover: ${palette.tblHeadHover};
                           --tblCellBorder : ${palette.tblCellBorder};
                           --tblActiveRow : ${palette.tblActiveRow};
                           --tblActiveRowHover: ${palette.tblActiveRowHover};
                           --scrollBg : ${palette.scrollBg};
                           --scrollBorder : ${palette.scrollBorder};
                           --scrollThumb : ${palette.scrollThumb};
                           --mnuBtnBg: ${palette.mnuBtnBg};
                           --mnuBg: ${palette.mnuBg};
                           --mnuTxt: ${palette.mnuTxt};
                           --mnuItemHover: ${palette.mnuItemHover};
                           --mnuGrade1: ${palette.mnuGrade1};
                           --mnuGrade2: ${palette.mnuGrade2};
                           --mnuGlow: ${palette.mnuGlow};
                           --modalGlow: ${palette.modalGlow};
                           --overlay: ${palette.overlay};
                           --olTxt: ${palette.olTxt};
                       }`;

            fs.writeFile(path.join(__dirname, 'css', 'theme.css'), css, function (err) {
                if (!err) {
                    $('#themeCSS').attr('href', 'css/theme.css');
                    setTitleImg(thmName);
                    themeDB.update({applied: true}, { $set: { applied: false } }, function (err, numReplaced) {
                        if (err || numReplaced < 1) {
                            popMsg('Unable to update theme on DB', 'danger')();
                        } else {
                            themeDB.update({name: thmName}, { $set: { applied: true } }, function (err, numReplaced) {
                                if (err || numReplaced < 1) {
                                    popMsg('Unable to update theme on DB', 'danger')();
                                } else {
                                    loadThemes();
                                    popMsg('Theme \'' + theme.title + '\' has been applied', 'success')();
                                }
                            });
                        }
                    });
                } else {
                    popMsg('Unable to write the theme to file', 'danger')();
                }
            });

        } else {
            popMsg('Unable to load the theme from DB', 'danger')();
        }
    });
}

function setTitleImg(thmName) {
    let imgPath = path.join(__dirname, 'data', 'themes', 'assets', thmName, 'titlebar.png');
    let defPath = path.join(__dirname, 'img', 'ob_text_logo_titlebar.png');
    let comp = $('#imgTitleBar');
    try {
        if (fs.existsSync(imgPath)) {
            comp.attr('src', imgPath);
        } else {
            comp.attr('src', defPath);
        }
    } catch (error) {
        console.log(error);
        popMsg('An error occurred locating title bar image', 'danger')();
    }
}