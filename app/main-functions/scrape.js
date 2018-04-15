let Tracker = require('bittorrent-tracker');

process.on('uncaughtException', function (error) {
    console.log(error);
    process.send(['scrape-failed', 'general']); //mainWindow.webContents.send('scrape-failed', 'general');
});

let args = process.argv.slice(2);
let hash = base64toHEX(args[0]);

let trackers = ['http://tracker.tfile.me:80/announce',
    'udp://bt.xxx-tracker.com:2710/announce',
    'http://alpha.torrenttracker.nl:443/announce',
    'http://0d.kebhana.mx:443/announce',
    'udp://tracker.torrent.eu.org:451/announce',
    'udp://thetracker.org:80/announce',
    'http://torrent.nwps.ws:80/announce',
    'udp://inferno.demonoid.pw:3418/announce',
    'udp://tracker.coppersurfer.tk:6969/announce',
    'udp://open.stealth.si:80/announce',
    'udp://tracker.opentrackr.org:1337/announce',
    'udp://tracker.vanitycore.co:6969/announce',
    'udp://retracker.lanta-net.ru:2710/announce',
    'udp://tracker.justseed.it:1337/announce',
    'udp://tracker.tiny-vps.com:6969/announce',
    'udp://ipv4.tracker.harry.lu:80/announce',
    'http://share.camoe.cn:8080/announce',
    'udp://tracker.cypherpunks.ru:6969/announce',
    'http://retracker.mgts.by:80/announce',
    'http://tracker.city9x.com:2710/announce',
    'http://torrentsmd.com:8080/announce',
    'http://retracker.telecom.by:80/announce',
    'http://torrentsmd.eu:8080/announce',
    'udp://public.popcorn-tracker.org:6969/announce',
    'udp://tracker.leechers-paradise.org:6969/announce'];

let opts = {
    infoHash: hash,
    announce: trackers,
    peerId: new Buffer('01234567890123456789'),
    port: 6881
};

let client = new Tracker(opts);

client.scrape();

client.on('scrape', function (data, err) {
    // console.log(data.complete);
    process.send(['scrape-update', data]); //mainWindow.webContents.send('scrape-update', data);
}).on('error', function (err) {
    console.log(err);
});

function base64toHEX(base64) {
    let raw = new Buffer(base64, 'base64').toString('binary');
    let HEX = '';
    for (let i = 0; i < raw.length; i++) {
        let _hex = raw.charCodeAt(i).toString(16)
        HEX += (_hex.length == 2 ? _hex : '0' + _hex);
    }
    return HEX.toUpperCase();
}