const {ipcRenderer} = require('electron');

window.onerror = function (msg, url, lineNo, columnNo, error) {
    ipcRenderer.send('logger', '[SPLASH]' + error.stack);
}; // Send window errors to Main process

ipcRenderer.on('fade', function () {
    document.body.style.opacity = '1';
});