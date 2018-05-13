const {ipcRenderer} = require('electron');

ipcRenderer.on('fade', function () {
    document.body.style.opacity = '1';
});