const electron = require('electron');
const {ipcRenderer} = electron;

/* Window controls
--------------------*/
ipcRenderer.on('maxed', function () {
    let i = document.querySelector('#btnMaximize i');
    i.classList.remove('zmdi-window-maximize');
    i.classList.add('zmdi-window-restore');
});
ipcRenderer.on('restored', function () {
    let i = document.querySelector('#btnMaximize i');
    i.classList.remove('zmdi-window-restore');
    i.classList.add('zmdi-window-maximize');
});

document.querySelector('#btnClose').addEventListener('click', function () {
    ipcRenderer.send('app-close');
} );
document.querySelector('#btnMinimize').addEventListener('click', function () {
    ipcRenderer.send('app-min');
} );
document.querySelector('#btnMaximize').addEventListener('click', function () {
    ipcRenderer.send('app-max');
} );
/*-----------------------------*/
