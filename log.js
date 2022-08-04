const fs = require("fs");

const logFile = fs.createWriteStream('./logs/TIKTOK_' + Date.now() + '.log', { flags: 'a' });

function error(message) {
    console.log("[ERR] " + message);
    logFile.write("[ERR] " + message + '\n');
}

function warn(message) {
    console.log("[WRN] " + message);
    logFile.write("[WRN] " + message + '\n');
}

function info(message) {
    console.log("[INF] " + message);
    logFile.write("[INF] " + message + '\n');
}

function debug(message) {
    console.log("[DBG] " + message);
    logFile.write("[DBG] " + message + '\n');
}

module.exports = { debug, info, warn, error }