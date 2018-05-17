const Tracker = require('bittorrent-tracker');
const DHT = require('bittorrent-dht');
const path = require('path');
const Datastore = require('nedb');

process.on('uncaughtException', function (error) {
    console.log(error);
    process.send(['scrape-failed', 'general']); //mainWindow.webContents.send('scrape-failed', 'general');
});

let args = process.argv.slice(2);
let hash = args[0];
let isDHT = (args[1] === 'true');
let trackers = [];

let config = new Datastore({
    filename: path.join(process.cwd(), 'data', 'config.db'),
    autoload: true
});

getTrackers().then(function (trcks) {
    if (!trcks || !trcks.length) {
        process.send(['scrape-warn', 'empty']); //mainWindow.webContents.send('scrape-warn', 'empty');
    } else {
        trackers = trcks;
        scrapeTrackers();
    }
    if (isDHT) {
        scrapeDHT();
    }
}).catch(function (err) {
    process.send(['scrape-warn', 'db']); //mainWindow.webContents.send('scrape-warn', 'db');
    console.log(err);
    if (isDHT) {
        scrapeDHT();
    }
});

// Get trackers list from DB
function getTrackers() {
    return new Promise((resolve, reject) => {
        config.findOne({type: 'trackers'}, function (err, trck) {
            if (!err && trck) {
                resolve(trck.trackers);
            } else {
                console.log(err);
                reject();
            }
        })
    });
}

function scrapeDHT() {
    let dht = new DHT();
    let timer;

    dht.listen(20000);

    dht.on('peer', function () {
        if (timer){
            process.send(['scrape-update-DHT', 0]); //mainWindow.webContents.send('scrape-update-DHT');
            clearTimeout(timer);
            timer = setTimeout(function () {
                dht.destroy();
            }, 5000);
        }
    });

    dht.lookup(hash);

    timer = setTimeout(function () {
        dht.destroy();
    }, 5000);

}

function scrapeTrackers() {
    let opts = {
        infoHash: hash,
        announce: trackers,
        peerId: new Buffer('01234567890123456789'),
        port: 6881
    };

    let client = new Tracker(opts);

    client.scrape();

    client.on('scrape', function (data) {
        process.send(['scrape-update', data]); //mainWindow.webContents.send('scrape-update', data);
    }).on('error', function (err) {
        console.log(err);
    });
}