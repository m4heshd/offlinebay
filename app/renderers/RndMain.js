const electron = require('electron');
const {ipcRenderer, clipboard, shell} = electron;
const path = require('path');
const fs = require('fs');
const rimraf = require('rimraf');
const Datastore = require('nedb');
const AdmZip = require('adm-zip');
const moment = require('moment');

let prefs = {
    sysTray: false,
    useDHT: true,
    trckURL: 'https://newtrackon.com/api/stable',
    updURL: 'https://thepiratebay.org/static/dump/csv/torrent_dump_full.csv.gz',
    updLast: '2003-01-01T00:00:00.000Z',
    updType: 'off',
    updInt: 20,
    updStat: ['complete', '', ''],
    keepDL: false,
    theme: 'default',
    thmURL: 'https://www.google.com/search?q=OfflineBay%20themes',
    useAC: true
};

/* Logging
------------*/
console.log = function (data) {
    ipcRenderer.send('logger', data);
}; // Send all console.logs to Main process
window.onerror = function (msg, url, lineNo, columnNo, error) {
    console.log('[MAIN_WINDOW] > ' + error.stack);
}; // Send window errors to Main process

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

            if (new Date() - new Date(pref.supMsg) > 604800000){
                setTimeout(function () {
                    popSupportMsg();
                    ipcRenderer.send('update-sup-msg');
                }, 60000);
            }
        } else {
            console.log(err);
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

            prefs.useAC = pref.useAC;
            searchHistory = pref.history;
            searchHistory.reverse();
            if (prefs.useAC) setAutocomplete();
        } else {
            console.log(err);
            popMsg('Unable to read preferences from config DB', 'danger')();
        }
    });

    config.findOne({type: 'trackers'}, function (err, trck) {
        if (!err && trck) {
            prefs.trckURL = trck.url;
            allTrackers = trck.trackers;
        } else {
            console.log(err);
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
            prefs.keepDL = dmp.keepDL;

            if (prefs.updType === 'auto' || prefs.updType === 'notify') {
                startAutoDump();
            }

        } else {
            console.log(err);
            popMsg('Unable to read preferences from config DB', 'danger')();
        }
    });

    config.findOne({type: 'etc'}, function (err, etc) {
        if (!err && etc) {
            if (etc.thmURL && etc.thmURL.trim() !== '') {
                prefs.thmURL = etc.thmURL;
            }
        } else {
            console.log(err);
            popMsg('Unable to read preferences from config DB', 'danger')();
        }
    });

    themeDB.findOne({applied: true}, function (err, theme) {
        if (!err && theme) {
            prefs.theme = theme.name;
            loadCustomCSS(prefs.theme);
            setTitleImg(prefs.theme);
        } else {
            console.log(err);
            popMsg('Unable to load current theme from DB', 'danger')();
        }
    });
}
loadPrefs();

/* Window Settings
--------------------*/
// Prevent OfflineBay window from routing to dropped files
$(window).on('dragover', event => event.preventDefault());

// Handle file Drag-and-drops
$(window).on('dragbetterenter', function () {
    ipcRenderer.send('drag-enter');
}).on('dragbetterleave', function () {
    ipcRenderer.send('drag-leave');
}).on('drop', function (event) {
    ipcRenderer.send('drop-import', event.originalEvent.dataTransfer.files[0].path);
    event.preventDefault();
});
ipcRenderer.on('show-drag-ol', function () {
    $("#olAnim").attr("src", "img/ball.svg");
    showOL('Drop to import..');
});

// Shortcut key to open the dev console
$(window).on('keyup', function (e) {
    if (e.ctrlKey && e.shiftKey && e.keyCode === 68) {
        ipcRenderer.send('show-dev');
    }
});

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

// Validate platform and validate shortcut if Windows
if (process.platform === 'win32') {
    let shortcut = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'OfflineBay.lnk');
    if (fs.existsSync(shortcut)) {
        try {
            let scDetails = shell.readShortcutLink(shortcut);
            if (scDetails.appUserModelId !== process.execPath) {
                popMsg('Your start menu shortcut is not valid anymore. Please go to <b>Settings > Windows shortcut</b>', 'warning')();
            }
        } catch (error) {
            console.log(error);
            popMsg('An error occured trying to validate the shortcut', 'danger')();
        }
    } else {
        popMsg('Shortcut not found. Notification won\'t work anymore. Please go to <b>Settings > Windows shortcut</b>', 'warning')();
    }
} else {
    $('#mnuItmShortcut').css('display', 'none');
}

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
    ipcRenderer.send('save-upd-last', [prefs.updLast, 'import']);
    prefs.updStat[0] = 'complete';
    hideOL();
    popMsg('Dump file imported successfully', 'success')();
    $('#txtStat').text('Dump updated @ ' + moment().format('YYYY-MM-DD hh:mm:ss'));
    $('#txtStatRight').css('visibility', 'hidden');
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
    ipcRenderer.send('upd-dump', [prefs.updURL, 'check', prefs.updLast]); // [URL, <type>]
});
// Fired on system tray update check menu click
ipcRenderer.on('upd-check-tray', function () {
    if (prefs.updType !== 'off') {
        stopAutoDump();
        startAutoDump();
    }
    setStatTxt('Checking for updates..');
    ipcRenderer.send('upd-dump', [prefs.updURL, 'tray', prefs.updLast]); // [URL, <type>]
});
// Fired after dump update is checked and none available
ipcRenderer.on('upd-check-unavail', function (event, data) {
    if (data === 'check') {
        hideOL();
        popMsg('Your dump file is up to date', 'success')();
    }
    $('#txtStatRight').css('visibility', 'hidden');
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
        $('#txtStatRight').css('visibility', 'hidden');
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
    ipcRenderer.send('upd-import', [data[0], data[1], prefs.keepDL]);
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

/* Windows Shortcut */
$('#mnuShortcut').on('click', function () {
    if (process.platform === 'win32') {
        if (confirm('You need a shortcut to OfflineBay on your start menu for Notifications to work.\nHit OK to create the shortcut now.', 'Windows shortcut helper')) {
            let shortcut = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'OfflineBay.lnk');
            let res = shell.writeShortcutLink(shortcut, {
                target: process.execPath,
                appUserModelId: process.execPath,
                icon: path.join(__dirname, 'img', 'icon.ico'),
                iconIndex: 0
            });
            if (res) {
                popMsg('Shortcut created successfully', 'success')();
            } else {
                popMsg('Failed to create the shortcut', 'danger')();
            }
        }
    } else {
        popMsg('You need to be on Windows to create a shortcut', 'warning')();
    }
});

/* Support */
$('#mnuSupport').on('click', function () {
    popSupportMsg();
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

    if (prefs.useAC) {
        addHistoryItm(query);
    }
}
$('#btnSearch').on('click', function () {
    startSearch();
});
// txtSearch Return key event
$('#txtSearch').keypress(function (e) {
    if (e.which === 13) {
        startSearch();
    }
}).keydown(function (e) {
    if(e.which === 27) {
        if (!$('.autocomplete-items').length) {
            $(this).val('');
            $(this).blur();
        }
    }
});
// txtResCount validation and Return key event
$('#txtResCount').keypress(function (e) {
    let charCode = e.which;
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
    ipcRenderer.send('scrape-start', [getInfoHash(hash), prefs.useDHT]);

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
                console.log(err);
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
            console.log(err);
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
    $('.body-container').css('filter', 'var(--olEffect)');
}

// Hide window overlay
function hideOL() {
    $('#overlay').css({
        opacity: 0,
        visibility: 'hidden'
    });
    $('.body-container').css('filter', '');
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
$('#btnResetUpd').on('click', function () {
    if (confirm('Are you sure you want to reset current dump update timestamp?', 'Reset Dump update')) {
        prefs.updLast = new Date('2003-01-01').toISOString();
        $('#txtLastUpd').text('2003-01-01 00:00:00');
        ipcRenderer.send('save-upd-last', [prefs.updLast, 'reset']);
    }
});

// Set current values to preferences window components
function setPrefsWindow(){
    $('#chkTray').prop('checked', prefs.sysTray);
    $('#chkLogger').prop('checked', ipcRenderer.sendSync('get-logger-type'));
    $('#txtTrckURL').removeClass('txtinvalid').val(prefs.trckURL);
    $('#chkDHT').prop('checked', prefs.useDHT);
    $('#txtDumpURL').removeClass('txtinvalid').val(prefs.updURL);
    $('#rdoUpdType input[value="' + prefs.updType + '"]').prop('checked', true);
    $('#txtUpdInt').val(prefs.updInt);
    $('#chkKeepDL').prop('checked', prefs.keepDL);
    $('#txtLastUpd').text(moment(prefs.updLast).format('YYYY-MM-DD hh:mm:ss'));
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
    prefs.keepDL = $('#chkKeepDL').prop('checked');
    ipcRenderer.send('pref-change', ['logToFile', $('#chkLogger').prop('checked')]);

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
            template: '<div data-notify="container" class="col-xs-11 col-sm-4 alert alert-{0} alert-or" role="alert">' +
            '    <button type="button" aria-hidden="true" class="close close-or" data-notify="dismiss">&times;</button>' +
            '    <span data-notify="icon"></span> ' +
            '    <span data-notify="title">{1}</span> ' +
            '    <span data-notify="message" style="vertical-align: middle">{2}</span>' +
            '    <div class="progress" data-notify="progressbar">' +
            '        <div class="progress-bar progress-bar-{0}" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100" style="width: 0%;">' +
            '        </div>' +
            '    </div>' +
            '    <a href="{3}" target="{4}" data-notify="url"></a>' +
            '</div>'
        });
    }
}

// Pop up Support offlinebay alert
function popSupportMsg() {
    $.notify({}, {
        type: 'light',
        delay: 0,
        z_index: 1051,
        placement: {
            from: 'bottom',
            align: 'right'
        },
        animate: {
            enter: 'animated fadeInUp',
            exit: 'animated fadeOutDown'
        },
        template: '<div data-notify="container" class="col-xs-11 col-sm-4 alert alert-{0} alert-or support-alert" role="alert">' +
        '    <button type="button" aria-hidden="true" class="close close-or" data-notify="dismiss">&times;</button>' +
        '    <h2>Loving OfflineBay?</h2>' +
        '    <h5>Give some support..</h5>' +
        '    <div class="support-body">' +
        '        <div>' +
        '            <img src="img/heart.png">' +
        '        </div>' +
        '        <div class="item-v-center">' +
        '            <div>' +
        '                <span>BTC : <b><a class="btcLink">12d9qz6bzL6tiB4oeX595oEo9ENMTEzF5y</a></b></span>' +
        '                <span>ETH : <b><a class="ethLink">0xe84CBc4B4C64c6800619942172F93dcfb1030972</a></b></span>' +
        '                <span>BCH : <b><a class="bchLink">qqguu77ylq7p72m02ksv78jyzy86vtk6jqtrrc40r3</a></b></span>' +
        '            </div>' +
        '        </div>' +
        '    </div>' +
        '</div>'
    });
}

$('body').on('click', '.btcLink, .ethLink, .bchLink', function () {
    clipboard.writeText($(this).html());
    popMsg('Address copied to clipboard', 'info')();
});

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
            ipcRenderer.send('upd-import', [prefs.updStat[1], prefs.updStat[2], prefs.keepDL]);
        } else {
            setStatTxt('Checking for updates..');
            ipcRenderer.send('upd-dump', [prefs.updURL, prefs.updType, prefs.updLast]); // [URL, <type>]
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
$(".themes-tiles").on('click', '.btn-theme-del', function () {
    removeTheme($(this).data('thm-name'));
});
$("#btnDLThemes").on('click', function () {
    openLink(prefs.thmURL);
});
$("#btnImportTheme").on('click', function () {
    ipcRenderer.send('theme-import');
});

ipcRenderer.on('init-theme-import', function (event, data) {
    importTheme(data);
}); // Fired after user opened a theme file

// Load all themes from DB
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
            console.log(err);
            popMsg('Unable to load themes from DB', 'danger')();
        }
    });
}

// Create theme tiles on themes window
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
                       background: ${palette.compClr};
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
                                <button class="btn-ui btn-themed btn-theme-del thm-${name}-btn" type="button" data-thm-name="${name}">
                                    <i class="zmdi zmdi-delete btn-ico"></i>
                                </button>
                            </div>
                        </div> <!-- A theme tile -->`
    }

    $("#themeStyles").empty().text(styles);
    $('#pnlThemeTiles').empty().append(tile);
}

// Rewrite theme.css for selected theme
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
                           --compClr : ${palette.compClr};
                           --compShadow1 : ${palette.compShadow1};
                           --compShadow2 : ${palette.compShadow2};
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
                           --olEffect: ${palette.olEffect};
                           --olTxt: ${palette.olTxt};
                       }`;

            fs.writeFile(path.join(__dirname, 'css', 'theme.css'), css, function (err) {
                if (!err) {
                    $('#themeCSS').attr('href', 'css/theme.css');
                    loadCustomCSS(thmName);
                    setTitleImg(thmName);
                    themeDB.update({applied: true}, { $set: { applied: false } }, function (err, numReplaced) {
                        if (err || numReplaced < 1) {
                            console.log(err);
                            popMsg('Unable to update theme on DB', 'danger')();
                        } else {
                            themeDB.update({name: thmName}, { $set: { applied: true } }, function (err, numReplaced) {
                                if (err || numReplaced < 1) {
                                    console.log(err);
                                    popMsg('Unable to update theme on DB', 'danger')();
                                } else {
                                    loadThemes();
                                    prefs.theme = thmName;
                                    popMsg('Theme \'' + theme.title + '\' has been applied', 'success')();
                                }
                            });
                        }
                    });
                } else {
                    console.log(err);
                    popMsg('Unable to write the theme to file', 'danger')();
                }
            });

        } else {
            console.log(err);
            popMsg('Unable to load the theme from DB', 'danger')();
        }
    });
}

// Set theme's title bar image if it's available
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

// Set theme's custom CSS if available
function loadCustomCSS(thmName) {
    let cssPath = path.join(__dirname, 'data', 'themes', 'assets', thmName, 'custom.css');
    try {
        if (fs.existsSync(cssPath)) {
            $('#customCSS').attr('href', `data/themes/assets/${thmName}/custom.css`);
        } else {
            $('#customCSS').attr('href', '');
        }
    } catch (error) {
        console.log(error);
        popMsg('An error occurred locating custom CSS', 'danger')();
    }
}

// Import compressed theme file opened by the user
function importTheme(thmPath) {
    try {
        let thmZip = new AdmZip(thmPath);
        let thmFile = thmZip.readAsText('theme.json');
        if (thmFile !== '') {
            try {
                let thmData = JSON.parse(thmFile);
                validateTheme(thmData).then(function () {
                    proceedImport(thmData, thmZip);
                }).catch(function (err) {
                    switch (err) {
                        case 'name':
                            popMsg('Invalid theme name. It cannot be empty', 'danger')();
                            break;
                        case 'title':
                            popMsg('Invalid theme title. It cannot be empty', 'danger')();
                            break;
                        case 'regex':
                            popMsg('Invalid theme name. It should only contain lowercase letters', 'danger')();
                            break;
                        case 'palette':
                            popMsg('Failed to import. Theme doesn\'t contain proper variables', 'danger')();
                            break;
                        default:
                            popMsg('Failed to import. An unknown error occurred', 'danger')();
                    }
                });
            } catch (error) {
                throw 'Failed to import. Invalid theme'
            }
        } else {
            throw 'Failed to import. Invalid theme'
        }
    } catch (error) {
        console.log(error);
        popMsg(error.toString(), 'danger')();
    }

    // Validate the theme.json file before importing
    function validateTheme(thmData) {
        return new Promise((resolve, reject) => {
            let isNameOk = typeof thmData.name === 'string' && thmData.name !== '';
            let isTitleOk = typeof thmData.title === 'string' && thmData.title !== '';

            if (isNameOk) {
                if (isTitleOk) {
                    let nameCheck = new RegExp("[^a-z]");
                    if (!nameCheck.test(thmData.name)) {
                        let pltVars = ['bodyTxt', 'bodyBg', 'compClr', 'compShadow1', 'compShadow2', 'txtFocusBg', 'txtFocustxt', 'txtFocusPH', 'btnTxtClr', 'btnTxtHover', 'btnBgHover', 'btnFocusGlow', 'btnActive', 'btnTxtDisable', 'btnBgDisable', 'btnBorderDisable', 'chkChecked', 'chkUnchecked', 'tblHeadBottomBorder', 'tblHeadHover', 'tblCellBorder', 'tblActiveRow', 'tblActiveRowHover', 'scrollBg', 'scrollBorder', 'scrollThumb', 'mnuBtnBg', 'mnuBg', 'mnuTxt', 'mnuItemHover', 'mnuGrade1', 'mnuGrade2', 'mnuGlow', 'modalGlow', 'overlay', 'olEffect', 'olTxt'];
                        for (let c = 0; c < pltVars.length; c++) {
                            if (typeof thmData.palette[pltVars[c]] !== 'string') {
                                reject('palette');
                                break;
                            }
                        }
                    } else {
                        reject('regex');
                    }
                } else {
                    reject('title');
                }
            } else {
                reject('name');
            }

            resolve();
        });
    }

    // Proceed to DB updates after validation
    function proceedImport(thmData, thmZip) {
        let thmName = thmData.name;
        let themeDB = new Datastore({
            filename: path.join(__dirname, 'data', 'themes', 'themes.db'),
            autoload: true
        });

        themeDB.findOne({name: thmName}, function (err, theme) {
            if (!err) {
                if (theme) {
                    if (confirm('Theme \'' + thmData.title + '\' already exists. Do you want to proceed and replace the theme?', 'Import Theme')) {
                        themeDB.update({name: thmName}, {
                            $set: {
                                title: thmData.title,
                                palette: thmData.palette
                            }
                        }, function (err, numReplaced) {
                            if (err || numReplaced < 1) {
                                console.log(err);
                                popMsg('Unable to replace the theme on DB', 'danger')();
                            } else {
                                extractThemeAssets(thmData, thmZip);
                            }
                        });
                    }
                } else {
                    themeDB.insert({
                        name: thmData.name,
                        title: thmData.title,
                        applied: false,
                        palette: thmData.palette
                    }, function (err) {
                        if (err) {
                            console.log(err);
                            popMsg('Unable to insert the theme to DB', 'danger')();
                        } else {
                            extractThemeAssets(thmData, thmZip);
                        }
                    });
                }
            } else {
                console.log(err);
                popMsg('Unable to load themes from DB', 'danger')();
            }
        });
    }

    // Check if the assets are available and extract them into theme's assets directory
    function extractThemeAssets(thmData, thmZip) {
        try {
            if (thmZip.getEntry('titlebar.png') !== null) {
                thmZip.extractEntryTo('titlebar.png', path.join(__dirname, 'data', 'themes', 'assets', thmData.name), false, true);
            }
            if (thmZip.getEntry('custom.css') !== null) {
                thmZip.extractEntryTo('custom.css', path.join(__dirname, 'data', 'themes', 'assets', thmData.name), false, true);
            }
            popMsg('Theme \'' + thmData.title + '\' imported successfully', 'success')();
            loadThemes();
        } catch (error) {
            console.log(error);
            popMsg(error.toString(), 'danger')();
        }
    }
}

// Remove themes
function removeTheme(thmName) {
    if (confirm('Are you sure you want to remove this theme?', 'Remove Theme')) {

        let themeDB = new Datastore({
            filename: path.join(__dirname, 'data', 'themes', 'themes.db'),
            autoload: true
        });

        themeDB.remove({name: thmName}, {}, function (err, numRemoved) {
            if (err || numRemoved < 1) {
                console.log(err);
                popMsg('Unable to remove the theme from DB', 'danger')();
            } else {
                let assetsDir = path.join(__dirname, 'data', 'themes', 'assets', thmName);
                if (fs.existsSync(assetsDir)) {
                    rimraf(assetsDir, function (err) {
                        if (err) {
                            console.log(err);
                            popMsg('Failed to remove the assets directory', 'warning')();
                        }
                    });
                }
                popMsg('Theme \'' + thmName + '\' was successfully removed', 'success')();
                if (prefs.theme === thmName) {
                    themeDB.update({name: 'default'}, { $set: { applied: true } }, function (err, numReplaced) {
                        if (err || numReplaced < 1) {
                            console.log(err);
                            popMsg('Unable to switch to default theme (DB Error)', 'danger')();
                        } else {
                            applyTheme('default');
                        }
                    });
                } else {
                    loadThemes();
                }
            }
        });
    }
}

/* Autocomplete
----------------*/
let searchHistory = [];

// Set key events and functions to txtSearch to perform autocomplete
function setAutocomplete() {
    let comp = $('#txtSearch');
    let currentFocus;

    comp.on('input', function () {
        let dropdown;
        let txt = $(this).val().toLowerCase().trim();

        closeAllLists();
        if (!txt) { return false;}
        currentFocus = -1;

        dropdown = $(`<div id="${$(this).attr('id') + 'autocomplete-list'}" class="autocomplete-items"></div>`);
        $(this).parent().append(dropdown);

        dropdown.on('click', 'div', function () {
            comp.val($(this).data('txt'));
            closeAllLists();
            comp.focus();
        });

        let count = 0;
        for (let c = 0; c < searchHistory.length; c++) {
            let idx = searchHistory[c].toLowerCase().indexOf(txt);
            if (idx > -1) {
                let newItm = `<div data-txt="${searchHistory[c]}"><span>${searchHistory[c].substr(0, idx)}<strong>${searchHistory[c].substr(idx, txt.length)}</strong>${searchHistory[c].substr(idx + txt.length)}</span></div>`;
                dropdown.append(newItm);
                count++;
            }
            if (count > 4) break;
        }
        if (!count) {
            closeAllLists();
        }
    });

    comp.on('keydown', function (e) {
        let x = $(`#${$(this).attr('id')}autocomplete-list`);
        if (x[0]) x = x.find('div');
        if (x.length) {
            if (e.which === 40) {
                e.preventDefault();
                currentFocus++;
                addActive(x);
            } else if (e.which === 38) {
                e.preventDefault();
                currentFocus--;
                addActive(x);
            } else if (e.which === 13) {
                e.preventDefault();
                if (currentFocus > -1) {
                    x[currentFocus].click();
                } else {
                    closeAllLists();
                    startSearch();
                }
            }
        }
        if (e.which === 27) {
            closeAllLists();
        }
    });

    function addActive(x) {
        removeActive(x);
        if (currentFocus >= x.length) currentFocus = 0;
        if (currentFocus < 0) currentFocus = (x.length - 1);
        $(x[currentFocus]).addClass('autocomplete-active');
    }

    function removeActive(x) {
        x.removeClass('autocomplete-active');
    }

    function closeAllLists() {
        $('.autocomplete-items').remove();
    }

    $(document).on('click', function (e) {
        if(!$(e.target).parents('.autocomplete-items')[0]){
            closeAllLists();
        }
    })
}

// Add new item to the search history if it doesn't already exist
function addHistoryItm(text) {
    let exist = false;
    let formatted = text.toLowerCase().trim();
    for (let c = 0; c < searchHistory.length; c++) {
        if (searchHistory[c].toLowerCase() === formatted){
            exist = true;
            break;
        }
    }
    if (!exist) {
        searchHistory.unshift(text.trim());
        ipcRenderer.send('add-history-itm', text.trim());
    }
}