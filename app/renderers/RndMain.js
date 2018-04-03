const electron = require('electron');
const {ipcRenderer} = electron;

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
