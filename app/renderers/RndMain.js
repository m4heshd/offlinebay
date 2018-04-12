const electron = require('electron');
const {ipcRenderer} = electron;

/* Window Settings
--------------------*/
document.addEventListener('dragover', event => event.preventDefault());
document.addEventListener('drop', event => event.preventDefault());

/* Window controls
--------------------*/
ipcRenderer.on('maxed', function () {
    $('#btnMaximize i').removeClass('zmdi-window-maximize').addClass('zmdi-window-restore');
});
ipcRenderer.on('restored', function () {
    $('#btnMaximize i').removeClass('zmdi-window-restore').addClass('zmdi-window-maximize');
});

$('#btnClose').on('click', function () {
    ipcRenderer.send('app-close');
});
$('#btnMinimize').on('click', function () {
    ipcRenderer.send('app-min');
});
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
ipcRenderer.on('import-start', function () {
    $("#olAnim").attr("src", "img/import.svg");
    showOL('Validating..');
});
ipcRenderer.on('import-update', function (event, txt) {
    $('#olText').text('Importing..' + txt + '%');
});
ipcRenderer.on('import-finalizing', function (event, txt) {
    $('#olText').text('Finalizing..');
});
ipcRenderer.on('import-success', function () {
    hideOL();
    popMsg('Dump file imported successfully', 'success')();
    $('#txtStat').text('Dump updated @ ' + moment().format('YYYY-MM-DD hh:mm:ss'));
});
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
let tbl = new Tablesort(document.getElementById('tblMain'));

/* Search */
function startSearch(){
    $("#olAnim").attr("src", "img/load.svg");
    showOL('Searching..');
    let query = $('#txtSearch').val();
    let count = parseInt($('#txtResCount').val());
    let smart = $('#chkSmartSearch').prop('checked');
    ipcRenderer.send('search-start', [query, count, smart]);
}
$('#btnSearch').on('click', function () {
    startSearch();
});
$('#txtSearch').keypress(function(e) {
    if(e.which === 13) {
        startSearch();
    }
});
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
ipcRenderer.on('search-success', function (event, data) {
    hideOL();
    $('#txtStat').text(data.resCount + ' Results found');
    $('#tblMainBody').html(data.results);
    tbl.refresh();
    $('#txtFilter').val('');
});

/* Overlay
-------------*/
ipcRenderer.on('hide-ol', function () {
    hideOL();
});

function showOL(text) {
    $('#olText').text(text);
    $('#overlay').css({
        visibility: 'visible',
        opacity: 1
    });
}

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
ipcRenderer.on('notify', function (event, msg) {
    popMsg(msg[0], msg[1])();
});

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
