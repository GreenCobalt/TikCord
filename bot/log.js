let shardId = undefined;
function init(sId) {
    shardId = sId;
}

function error(message) {
    console.log(`[${shardId.toString().padStart(2)}] [E] ${message}`);
}

function warn(message) {
    console.log(`[${shardId.toString().padStart(2)}] [W] ${message}`);
}

function info(message) {
    console.log(`[${shardId.toString().padStart(2)}] [I] ${message}`);
}

function debug(message) {
    console.log(`[${shardId.toString().padStart(2)}] [D] ${message}`);
}

module.exports = { init, debug, info, warn, error }