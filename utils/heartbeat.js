const axios = require('axios');
const log = require("./log.js");

let upSince = Date.now();

function updateManager(client, dlS, dlF, dlFReasons) {
    let guilds = client.guilds.cache;

    let servers = guilds.size;
    let users = 0;
    guilds.forEach((g) => {
        users += g.memberCount;
    });

    log.info("Sending stats to manager");
    axios.post('https://manager.snadol.com/api', {
		type: "botsIn",
		auth: "abc123",
		bot: "tiktok",
		uid: client.user.id,
		dlS: dlS,
		dlF: dlF,
		dlFR: dlFReasons,
		members: users,
		servers: servers,
		upsince: upSince
	}, { headers: { 'content-type': 'application/json' } })
        .then((res) => {
        	log.debug(`Sent stats to manager`);
		client.user.setPresence({ activities: [{ name: `${res.data.data.servers} servers`, type: 3 }], status: 'online' });
        })
        .catch((error) => {
         	log.warn(`Failed to send stats to mananger: ${error}`);
        });
}

function updateWebsites(client) {
    let guilds = client.guilds.cache;
    let users = 0;
    guilds.forEach((g) => {
        users += g.memberCount;
    });

	axios.post('https://top.gg/api/bots/837538034089590804/stats', {
			server_count: guilds.size
		}, { headers: {
			'Authorization': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjgzNzUzODAzNDA4OTU5MDgwNCIsImJvdCI6dHJ1ZSwiaWF0IjoxNjc0Nzc4NDQ3fQ.bcd9q2maE-wxX561UOyKMsphY1rEEbjq2vghrR02Zbo'
		}}).then((res) => {
				log.debug(`Sent bot stats to top.gg: ${guilds.size} servers`);
		}).catch((error) => {
				log.warn(`Failed to send stats to top.gg: ${error}`);
		});

	axios.post('https://discord.bots.gg/api/v1/bots/946107355316252763/stats', {
			guildCount: guilds.size
		}, { headers: {
			'Authorization': 'eyJhbGciOiJIUzI1NiJ9.eyJhcGkiOnRydWUsImlkIjoiNDQxMDQwMTYxNTg5OTUyNTYyIiwiaWF0IjoxNjc0Nzc4MjIwfQ.wzG8nw9yNM2MbOoewdWerALmlAlbxzTsU66ypbnMrAM'
		}}) .then((res) => {
				log.debug(`Sent bot stats to discord.bots.gg: ${guilds.size} servers`);
		}).catch((error) => {
				log.warn(`Failed to send stats to discord.bots.gg: ${error}`);
		});

	/*
	axios.post('https://discordbotlist.com/api/v1/bots/946107355316252763/stats', {
			guilds: guilds.size,
			users: users
		}, { headers: {
			'Authorization': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0IjoxLCJpZCI6Ijk0NjEwNzM1NTMxNjI1Mjc2MyIsImlhdCI6MTY3NDc4MDUzN30._FVH8RJKAwAwptqUsLyXWXMjHIrP-U5fliAVloE5uQA' 
		}}) .then((res) => {
				log.debug(`Sent bot stats to discordbotlist.com: ${guilds.size} servers`);
		}).catch((error) => {
				log.warn(`Failed to send stats to discordbotlist.com: ${error}`);
		});
	*/
}

function update(client, dlS, dlF, dlFReasons) {
	updateManager(client, dlS, dlF, dlFReasons);
	updateWebsites(client);
	/*
	axios.get('http://localhost:3001/api/push/kYTjjXq9xw?status=up&msg=' + dlS + '&ping=' + Math.round(client.ws.ping)).then((res) => {})
		.catch((error) => {
			log.debug(`Failed to send stats to UptimeKuma: ${error}`);
		});
	*/
}

module.exports = { update };
