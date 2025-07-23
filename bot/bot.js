const {
    Client,
    GatewayIntentBits,
    PermissionsBitField,
    SlashCommandBuilder,
    EmbedBuilder,
    REST,
    Routes
} = require('discord.js');

const axios = require('axios');
const fs = require("fs");
const process = require("process");
const tmp = require("tmp");
require('dotenv').config();

const log = require("./log.js");
const tiktok = require("./tiktok.js");
const settings = require("./settings.js");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const shardId = client.shard.ids[0];
log.init(shardId);

const userErrors = [
    "NOTFOUND",
    "unknown video type!",
    "link is not a valid TikTok video!",
    "DiscordAPIError[50013]: Missing Permissions"
];

const ramDisk = {
    name: "/dev/shm/tikcord"
}
if (!fs.existsSync(ramDisk.name)) fs.mkdirSync(ramDisk.name);
settings.init();
tiktok.init(ramDisk);

const commands = [
    new SlashCommandBuilder().setName('help').setDescription('Displays the help message'),
    new SlashCommandBuilder().setName('ping').setDescription('Pings the bot\'s servers'),

    new SlashCommandBuilder().setName('settings').setDescription('Set settings for this server (must be admin)')
        .addStringOption(option =>
            option.setName('setting')
                .setDescription('the setting to adjust')
                .addChoices(
                    { name: 'DeleteMessage', value: 'deleteMessage' },
                    { name: 'DeleteEmbed', value: 'deleteEmbed' }
                ))
        .addStringOption(option =>
            option.setName('value')
                .setDescription('the new value of the setting')
                .addChoices(
                    { name: 'True', value: 'true' },
                    { name: 'False', value: 'false' }
                ))
];
const test_commands = [
    new SlashCommandBuilder().setName("shards").setDescription("get list of shards")
];

const linkRegex = /(?<url>https?:\/\/(?<domain>(www\.)?(?<subdomain>vm\.|vt\.)?tiktok\.com)(\/t)?\/((?<uID>@[^\/]*)\/(?<linkType>video|photo)\/(?<vID>\d*)|(?<sID>[^\/]*))\/?)/;
const request = async (url, config = {}) => await (await axios.get(url, config));

if (!fs.existsSync(`${ramDisk.name}/videos/`)) fs.mkdirSync(`${ramDisk.name}/videos/`);
if (!fs.existsSync(`${ramDisk.name}/images/`)) fs.mkdirSync(`${ramDisk.name}/images/`);

process.on('SIGINT', function () {
    log.info("Caught SIGINT");
    process.exit();
});

process.on('SIGTERM', function () {
    log.info("Caught SIGTERM");
    client.destroy();
    process.exit();
});

process.on('uncaughtException', function (err) {
    log.error((new Date).toUTCString() + ' uncaughtException:', err.message);

    try {
        let lines = err.stack.split("\n");
        lines.forEach((l) => {
            log.error(l);
        });
    } catch (e) {
        log.error("Error formatting error");
        log.error(err.stack);
    }
});

client.tiktokstats = {
    dlS: 0,
    dlF: 0,
    dlFReasons: {}
};

client.on('ready', () => {
    log.info(`Logged in as ${client.user.tag}!`);

    const CLIENT_ID = client.user.id;
    const rest = new REST({ version: '9' }).setToken(process.env.TOKEN);
    (async () => {
        try {
            await rest.put(Routes.applicationCommands(CLIENT_ID), {
                body: commands
            });
            await rest.put(Routes.applicationGuildCommands(CLIENT_ID, "929881324167254106"), {
                body: test_commands
            });
        } catch (error) {
            if (error) console.error(error);
        }
    })();
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'ping') {
        await interaction.reply('Pong!');
    } else if (interaction.commandName === 'help') {
        await interaction.reply('Just send a TikTok link and the bot will automatically download and send it in the chat!');
    } else if (interaction.commandName === "settings") {
        if (interaction.memberPermissions.has(PermissionsBitField.Flags.Administrator)) {
            let options = { setting: interaction.options.getString('setting'), value: interaction.options.getString('value') };
            if (!options.setting && !options.value) {
                settings.getSetting(interaction.guild.id).then((settings) => {
                    let embedFields = [];
                    Object.keys(settings).forEach((setting) => {
                        embedFields.push(
                            {
                                name: setting,
                                value: settings[setting],
                                inline: true
                            }
                        );
                    });
                    interaction.reply({
                        embeds: [{
                            title: "Settings",
                            fields: embedFields,
                            color: 0x00FF00
                        }]
                    });
                });
            } else if (!options.setting || !options.value) {
                interaction.reply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle(`❌ You must supply either no setting and value (to view settings) or both setting and value (to set that setting to that value)`)] });
            } else {
                if (["deleteMessage", "deleteEmbed"].includes(options.setting) && ["true", "false"].includes(options.value)) {
                    settings.setSetting(interaction.guild.id, options.setting, options.value == "true").then(() => {
                        interaction.reply({ embeds: [new EmbedBuilder().setColor(0x00FF00).setTitle(`✅ ${options.setting} set to ${options.value}!`)] });
                    });
                } else {
                    interaction.reply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle(`❌ Unknown setting or value!`)] });
                }
            }
        } else {
            interaction.reply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle(`❌ You do not have permission to do this!`)] });
        }
    } else if (interaction.commandName === "shards") {
        client.shard.broadcastEval((client) => [client.shard.ids, client.ws.status, client.ws.ping, client.guilds.cache.size, client.tiktokstats])
            .then((results) => {
                const embed = new EmbedBuilder()
                    .setTitle(`👨‍💻 Bot Shards (${interaction.client.shard.count})`)
                    .setColor('#ccd6dd')
                    .setTimestamp();

                results.map((data) => {
                    embed.addFields([
                        {
                            name: `📡 Shard ${data[0]}`,
                            value: `**Status:** ${data[1] == 0 ? "✅" : "❌"}\n**Guilds:** ${data[3]}\n**Downloads:** ${data[4].dlS} / ${data[4].dlF}`,
                            inline: true
                        }
                    ]);
                });

                interaction.reply({ embeds: [embed] });
            });
    } else { }
});

function randomAZ(n = 5) {
    return (Math.floor(Math.random()*90000) + 10000).toString();
    /*
    return Array(n)
        .fill(null)
        .map(() => Math.random() * 100 % 25 + 'A'.charCodeAt(0))
        .map(a => String.fromCharCode(a))
        .join('');
    */
}

client.on('messageCreate', (message) => {
    if (message.content.includes("https://") && message.content.includes("tiktok.com")) {
        linkRegex.lastIndex = 0;
        let rgx = linkRegex.exec(message.content);
        if (rgx == null) {
            return;
        }

        let threadID = randomAZ();

        let url = rgx.groups.url;
        log.info(`[${threadID}] Initiating download on ${url}`);

        //start typing, ignore errors
        message.channel.sendTyping().catch((e) => { });

        new Promise((res, rej) => {
            if (rgx.groups.domain.includes("vm.tiktok.com") || rgx.groups.domain.includes("vt.tiktok.com") || rgx.groups.url.includes("/t/")) {
                request(url, {
                    headers: {
                        //"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.81 Safari/537.36"
                    }
                })
                .then((resp) => {
                    //log.info(`Redirect to ${resp.request.res.responseUrl}`);
                    res(resp.request.res.responseUrl.split("?")[0]);
                })
                .catch((error) => {
                    log.error(error);
                    rej(`NOTFOUND`);
                });
            } else {
                res(rgx.groups.url.split("?")[0]);
            }
        }).then((url) => {
            log.info(`[${threadID}] Downloading ${url}`);

            tiktok.getTikTokData(threadID, url)
                .then((data) => {
                    log.info(`[${threadID}] API request done, type ${data[0]}`);
                    // console.log(data);

                    let promise;
                    switch (data[0]) {
                        case tiktok.VidTypes.Video:
                            promise = tiktok.downloadVideo(threadID, url, data[1]);
                            break;
                        case tiktok.VidTypes.Slideshow:
                            promise = tiktok.downloadSlide(threadID, url, data[1], data[2]);
                            break;
                        case tiktok.VidTypes.Invalid:
                            promise = new Promise((res, rej) => { rej({err: data[1], send: data[2]}); });
                            break;
                        default:
                            promise = new Promise((res, rej) => { rej({err: "BADTYPE (NH)", send: false}); });
                            break;
                    }

                    promise
                        .then((resp) => {
                            message.reply({ files: [resp] }).then(() => {
                                //sending as reply to initial message
                                log.info(`[${threadID}] Message sent (reply), deleting ${resp}`);
                                fs.unlinkSync(resp);
                                client.tiktokstats.dlS++;

                                settings.getSetting(message.guild.id).then((settings) => {
                                    if (settings.deleteMessage) {
                                        log.info(`[${threadID}] Removing original message`);
                                        message.delete();
                                    } else {
                                        if (settings.deleteEmbed) {
                                            log.info(`[${threadID}] Removing embed for original message`);
                                            message.suppressEmbeds(true);
                                        }
                                    }
                                });
                            }).catch((e) => {
                                console.log(e.message);

                                if (e.code == 50035 /* invalid form body */ || e.code == 160002 /* no permission to reply due to message history */) {
                                    message.channel.send({ files: [resp] }).then(() => {
                                        //could not reply to embed, sending regularly
                                        log.info(`[${threadID}] Message sent (channel), deleting ${resp}`);
                                        fs.unlinkSync(resp);
                                        client.tiktokstats.dlS++;

                                        settings.getSetting(message.guild.id).then((settings) => {
                                            if (settings.deleteEmbed) {
                                                log.info(`[${threadID}] Removing embed for original message`);
                                                message.suppressEmbeds(true);
                                            }
                                        });
                                    }).catch((e) => {
                                        log.error(`[${threadID}] Error sending message to channel: ${e.toString()}, deleting ${resp}`);
                                        fs.unlinkSync(resp);

                                        if (!Object.keys(client.tiktokstats.dlFReasons).includes(e.toString())) client.tiktokstats.dlFReasons[e.toString()] = 0;
                                        client.tiktokstats.dlFReasons[e.toString()]++;
                                        if (!userErrors.includes(e.toString())) client.tiktokstats.dlF++;
                                    });
                                } else {
                                    log.error(`[${threadID}] Error sending message as reply, not in retry list: ${e}, deleting ${resp}`);
                                    fs.unlinkSync(resp);

                                    if (!Object.keys(client.tiktokstats.dlFReasons).includes(e.toString())) client.tiktokstats.dlFReasons[e.toString()] = 0;
                                    client.tiktokstats.dlFReasons[e.toString()]++;
                                    if (!userErrors.includes(e.toString())) client.tiktokstats.dlF++;
                                }
                                return;
                            });
                        })
                        .catch((e) => { // tiktok video download failed
                            if (e.send)
                            {
                                message.reply(`Could not download video: ${e.err.toString()}`).then(() => { }).catch((e2) => {
                                    log.debug(`[${threadID}] Count not send video download failure message to channel: ${e2.toString()}`);
                                });
                            }
                            
                            log.info(`[${threadID}] Could not download video (DL, sending message: ${e.send}): ${e.err.toString()}`);

                            if (!Object.keys(client.tiktokstats.dlFReasons).includes(e.toString())) client.tiktokstats.dlFReasons[e.err.toString()] = 0;
                            client.tiktokstats.dlFReasons[e.err.toString()]++;

                            if (!userErrors.includes(e.err.toString())) client.tiktokstats.dlF++;
                        });
                })
                .catch((e) => { // api request failed
                    let errString = `API ${e.err.response.status} ${e.err.response.statusText}`;
                    
                    if (e.send)
                    {
                        message.reply(`Could not download video: ${errString}`).then(() => { }).catch((e2) => {
                            log.debug(`[${threadID}] Count not send video download failure message to channel: ${e2.toString()}`);
                        });
                    }
                    
                    log.info(`[${threadID}] Could not download video (API): ${errString}`); // axios error returned

                    if (!Object.keys(client.tiktokstats.dlFReasons).includes(errString)) client.tiktokstats.dlFReasons[errString] = 0;
                    client.tiktokstats.dlFReasons[errString]++;

                    if (!userErrors.includes(errString)) client.tiktokstats.dlF++;
                });
        })
        .catch((e) => { // initial web request failed            
            log.info(`[${threadID}] Could not download video (IR): ${e.toString()}`);

            if (!Object.keys(client.tiktokstats.dlFReasons).includes(e.toString())) client.tiktokstats.dlFReasons[e.toString()] = 0;
            client.tiktokstats.dlFReasons[e.toString()]++;

            if (!userErrors.includes(e.toString())) client.tiktokstats.dlF++;
        });
    }
});

log.info("Logging in");
client.login(process.env.TOKEN);
