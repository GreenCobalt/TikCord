const { ShardingManager } = require('discord.js');
const { InfluxDB, Point } = require('@influxdata/influxdb-client');
const axios = require('axios');
require('dotenv').config();

const upSince = Date.now();
const sites = {
    'https://top.gg/api/bots/946107355316252763/stats': {
        variable: "server_count",
        token: process.env.TOPGG_TOKEN
    },
    'https://discord.bots.gg/api/v1/bots/946107355316252763/stats': {
        variable: "guildCount",
        token: process.env.BOTSGG_TOKEN
    },
    'https://discordbotlist.com/api/v1/bots/946107355316252763/stats': {
        variable: "guilds",
        token: process.env.DBL_TOKEN
    }
};

const influxDB = new InfluxDB({'url': 'http://192.168.1.21:8086', 'token': 'wXKQn0zAxPTuqssBfYMJSj1mbSqAjiul2cAX7TXOGL-cK_eR3Gnf2Ok3mcfJQh9v0R5mSmRZo7guRjmn7o6wlA=='});
const writeApi = influxDB.getWriteApi('snadol', 'tikcord');
// writeApi.useDefaultTags({region: 'west'});

function reduceObj(ex, add) {
    Object.keys(add).forEach((key) => {
        if (!Object.keys(ex).includes(key)) { ex[key] = 0; }
        ex[key] += add[key];
    });
    return ex;
}

let sinceWebsiteUpdated = 10;
function updateServerCount() {
    manager.broadcastEval((client) => [client.guilds.cache, client.tiktokstats, process.env.SHARD_ID]).then((shards) => {
        let serverCount = shards.reduce((total, shard) => total + shard[0].length, 0);
        let memberCount = shards.reduce((total, shard) => total + shard[0].reduce((members, guild) => members + guild.memberCount, 0), 0);

        //update shard activities
        manager.broadcastEval((c, { servers }) => {
            [
                c.user.setPresence({ activities: [{ name: `${servers} servers`, type: 3 }], status: 'online' })
            ];
        }, { context: { servers: serverCount } });

        if (!process.env.DISABLE_HEARTBEAT) {
            //update bot listing sites
            if (sinceWebsiteUpdated > 9) {
                Object.keys(sites).forEach((site) => {
                    axios.post(site, {
                        [sites[site].variable]: serverCount
                    }, {
                        headers: {
                            'Authorization': sites[site].token
                        }
                    })
                        .then((res) => {
                            console.log(`Updated ${site}`);
                        })
                        .catch((error) => {
                            console.log(`Failed to send stats to ${site}: ${error}`);
                        });
                });
                sinceWebsiteUpdated = 0;
            } else {
                sinceWebsiteUpdated++;
            }

            //update manager
            axios.post('https://manager.snadol.com/api', {
                type: "botsIn",
                auth: process.env.MANAGER_TOKEN,
                bot: "tiktok",
                dlS: shards.reduce((total, shard) => total + shard[1].dlS, 0),
                dlF: shards.reduce((total, shard) => total + shard[1].dlF, 0),
                dlFR: shards.reduce((total, shard) => reduceObj(total, shard[1].dlFReasons), {}),
                members: memberCount,
                servers: serverCount,
                upsince: upSince
            }, { headers: { 'content-type': 'application/json' } })
                .then((res) => { })
                .catch((error) => {
                    console.log(`Failed to send stats to mananger: ${error}`);
                });

	    let points = [];
	    shards.forEach((s) => {
		points.push(new Point('downloads').tag('shard', s[2]).tag('success', 1).uintField('value', s[1].dlS));
		points.push(new Point('downloads').tag('shard', s[2]).tag('success', 0).uintField('value', s[1].dlF));
	        points.push(new Point('members').tag('shard', s[2]).uintField('value', s[0].reduce((members, guild) => members + guild.memberCount, 0)));
	        points.push(new Point('servers').tag('shard', s[2]).uintField('value', s[0].length));
	    });
	    writeApi.writePoints(points);
	    writeApi.flush();
        }
    });
}

function updateMemory()
{
    let memPoints = [];
    manager.broadcastEval(() => {
        const memory = process.memoryUsage();
        return {
            shardId: process.env.SHARD_ID, // You might need to set this env var in the shard process
            rss: memory.rss, // Resident Set Size
            heapTotal: memory.heapTotal,
            heapUsed: memory.heapUsed,
            external: memory.external,
            arrayBuffers: memory.arrayBuffers,
        };
    }).then((results) => {
        results.forEach((r) => {
            memPoints.push(new Point('memory').tag('shard', r.shardId).tag('type', 'rss').uintField('value', r.rss));
            memPoints.push(new Point('memory').tag('shard', r.shardId).tag('type', 'arrayBuffers').uintField('value', r.arrayBuffers));
            memPoints.push(new Point('memory').tag('shard', r.shardId).tag('type', 'heapTotal').uintField('value', r.heapTotal));
            memPoints.push(new Point('memory').tag('shard', r.shardId).tag('type', 'heapUsed').uintField('value', r.heapUsed));
            memPoints.push(new Point('memory').tag('shard', r.shardId).tag('type', 'external').uintField('value', r.external));
        });
	// console.log(memPoints);
	writeApi.writePoints(memPoints);
	writeApi.flush();
    });
}

const manager = new ShardingManager('./bot/bot.js', { 
    token: process.env.TOKEN, 
    totalShards: parseInt(process.env.SHARD_COUNT) ,
    execArgv: [ "--expose-gc" ]
});
manager.spawn({
    delay: 500
}).then(() => {
    updateServerCount();
    updateMemory();
    setInterval(updateServerCount, 30 * 1000);
    setInterval(updateMemory, 10 * 1000);
});

process.on('SIGINT', function () {
    process.exit()
});
