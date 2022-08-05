const { Client, GatewayIntentBits } = require('discord.js');
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

const axios = require('axios');
const fs = require("fs");
const ffmpeg = require('fluent-ffmpeg');
const puppeteer = require('puppeteer');
const log = require("./log.js");
//const jssoup = require('jssoup').default;

let linkRegex = /(?<url>https?:\/\/(www\.)?(?<domain>vm\.tiktok\.com|vt\.tiktok\.com|tiktok\.com\/t\/|tiktok\.com\/@(.*[\/]))(?<path>[^\s]+))/;
const request = async (url, config = {}) => await (await axios.get(url, config));
const getURLContent = (url) => axios({ url, responseType: 'arraybuffer' }).then(res => res.data).catch((e) => { log.info(e) });

//process setup

process.on('unhandledRejection', (reason, p) => {
    log.error('Unhandled Rejection: ', reason, p);
});

process.on('uncaughtException', function (err) {
    log.error((new Date).toUTCString() + ' uncaughtException:', err.message);

    let lines = err.stack.split("\n");
    lines.forEach((l) => {
        log.error(l);
    });

    restartBot();
});

//discord bot

let dlS = 0, dlF = 0;

client.on('ready', () => {
    log.info(`Logged in as ${client.user.tag}!`);
    setInterval(updateManager, 15 * 1000);
    updateManager();
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'ping') {
        await interaction.reply('Pong!');
    } else if (interaction.commandName === 'help') {
        await interaction.reply('Just send a TikTok link and the bot will automatically download and send it in the chat!');
    } else if (interaction.commandName === 'restart') {
        if (interaction.user.id === 441040161589952562) {
            await interaction.reply('Restarting bot!');
            restartBot();
        } else {
            await interaction.reply('You do not have permission to do that!');
        }
    }
});

client.on('messageCreate', (message) => {
    if (message.content.includes("https://") && message.content.includes("tiktok.com")) {
        log.info(`Could be TikTok URL`);

        linkRegex.lastIndex = 0;
        let rgx = linkRegex.exec(message.content);
        if (rgx == null) {
            log.info("Not TikTok URL");
            return;
        }
        log.info(`Initiating download on ${rgx.groups.url}`);

        //start typing, ignore errors
        message.channel.sendTyping().catch((e) => { });

        new Promise((res, rej) => {
            if (rgx.groups.domain.includes("vm.tiktok.com") || rgx.groups.domain.includes("vt.tiktok.com") || rgx.groups.url.includes("/t/")) {
                request(rgx.groups.url, {
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.81 Safari/537.36",
                        "tt_csrf_token": "CnGuS2KOVoET1MfVTgyFAxwz"
                    }
                })
                    .then((resp) => {
                        log.info(`Redirect to ${resp.request.res.responseUrl}`)
                        res(resp.request.res.responseUrl.split("?")[0]);
                    })
                    .catch((error) => {
                        rej(`NOTFOUND`);
                    });
            } else {
                res(rgx.groups.url.split("?")[0]);
            }
        }).then((url) => {
            log.info(`Downloading ${url}`);

            downloadVideo(url)
                .then((resp) => {
                    message.reply({ files: [resp] }).then(() => {
                        log.info("Message sent (reply), deleting " + resp);
                        fs.unlinkSync(resp);
                        dlS++;
                    }).catch((e) => {
                        if (e.code == 50035) {
                            message.channel.send({ files: [resp] }).then(() => {
                                log.info("Message sent (channel), deleting " + resp);
                                fs.unlinkSync(resp);
                                dlS++;
                            }).catch((e) => {
                                log.error(`Error sending message: ${e}, deleting ${resp}`);
                                fs.unlinkSync(resp);
                                dlF++;
                            });
                        } else {
                            log.error(`Error sending message: ${e}, deleting ${resp}`);
                            fs.unlinkSync(resp);
                            dlF++;
                        }
                    });
                })
                .catch((error) => {
                    message.reply(`Could not download video: ${e}`);
                    log.info(`Could not download video: ${e}`);
                    dlF++;
                });

            /*
            request(url, { headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 10_3_1 like Mac OS X) AppleWebKit/603.1.30 (KHTML, like Gecko) Version/10.0 Mobile/14E304 Safari/602.1" } })
                .then((resp) => {
                    let soup = new jssoup(resp.data);
                    let tikType = soup.findAll('div', attrs = { 'class': 'swiper-slide' });
                    if (tikType.length == 0) {
                        NORMAL VIDEO DOWNLOAD CODE HERE
                    } else {
                        downloadSlide(url, soup)
                            .then((resp) => {
                                message.channel.send({ files: [resp] });
                                log.info("Message sent!");
                            })
                            .catch((error) => {
                                message.channel.send(`Could not download video: ${e}`);
                                log.info(`Could not download video: ${e}`);
                            });
                    }
                })
                .catch((e) => {
                    //could not get initial tiktok page
                    message.channel.send(`Could not download video: ${e.response.status == 404 ? "NOTFOUND" : "UNKNOWN"}`);
                    log.info(`Could not download video: ${e.response.status == 404 ? "NOTFOUND" : "UNKNOWN"}`);
                });
                */
        })
            .catch((e) => {
                message.reply(`Could not download video: ${e}`);
                log.info(`Could not download video: ${e}`);
                dlF++;
            });
    }
});

//functions

function updateManager() {
    let guilds = client.guilds.cache;

    let servers = guilds.size;
    let users = 0;
    guilds.forEach((g) => {
        users += g.memberCount;
    });

    //let url = `http://localhost:8601/discordU?type=tiktok&id=main&members=${users}&servers=${servers}&uid=${client.user.id}&dls=${dlS}&dlf=${dlF}`;
    let url = `http://manager.snadol.com/discordU?type=tiktok&id=main&members=${users}&servers=${servers}&uid=${client.user.id}&dls=${dlS}&dlf=${dlF}`;
    request(url)
        .then((resp) => {
            log.debug(`Sent stats to manager: ${users} users, ${servers} servers, ${dlS} download successes, ${dlF} download failures, bot id: ${client.user.id}`);
            client.user.setPresence({ activities: [{ name: `${resp.data.servers} servers`, type: 3 }], status: 'online' });
        })
        .catch((error) => {
            log.warn(`Failed to send stats to mananger: ${error}`);
        });
}

function randomAZ(n = 5) {
    return Array(n)
        .fill(null)
        .map(() => Math.random() * 100 % 25 + 'A'.charCodeAt(0))
        .map(a => String.fromCharCode(a))
        .join('')
}

function getTikTokData(url) {
    return new Promise((res, rej) => {
        puppeteer.launch({
            headless: true,
            devtools: false,
            ignoreHTTPSErrors: true,
            args: [
                '--no-sandbox'
            ]
        }).then((browser) => {
            browser.newPage().then((page) => {
                page.setViewport({ width: 1600, height: 900 }).then(() => {
                    page.setRequestInterception(true).then(() => {
                        let requestAborted = false;
                        let goodURL;
                        page.on('request', request => {
                            if (requestAborted == false) {
                                if (request.resourceType() === 'media') {
                                    requestAborted = true;
                                    page.evaluate(() => window.stop()).then(() => {
                                        goodURL = request.url();
                                    });
                                } else {
                                    request.continue();
                                }
                            } else {
                                request.abort();
                            }
                        });
                        page.goto(url, { waitUntil: "networkidle2" })
                            .then(() => {
                                browser.close();
                                res(goodURL);
                            })
                            .catch((error) => {
                                log.info(error);
                                rej("NOTFOUND");
                            });
                    });
                });
            });
        });
    });
}

function downloadVideo(url) {
    return new Promise((res, rej) => {
        getTikTokData(url)
            .then((vidURL) => {
                let id = url.split("?")[0].split("/")[5];
                let randomName = randomAZ();
                let name = `./videos/${id}_${randomName}_encode.mp4`;

                getURLContent(vidURL).then((content) => {
                    fs.writeFileSync(name, content);
                    log.info(`Downloaded successfully to ${name}`);

                    compressVideo(name, `./videos/${id}_${randomName}.mp4`, 7500)
                        .then((compressedName) => {
                            res(compressedName);
                        })
                        .catch((e) => {
                            log.error(e);
                        });
                }).catch((e) => { });
            })
            .catch(error => {
                rej(error);
            });
    });
}

function compressVideo(videoInputPath, videoOutputPath, targetSize) {
    let min_audio_bitrate = 32000;
    let max_audio_bitrate = 256000;

    return new Promise((res, rej) => {
        ffmpeg.ffprobe(videoInputPath, (err, probeOut) => {
            if (probeOut.format.size > 8 * 1000 * 1000) {
                //too big
                log.info(`Encoding ${videoInputPath} to under 8MB`);

                let duration = probeOut.format.duration;
                let audioBitrate = probeOut.streams[1].bit_rate;
                let targetTotalBitrate = (targetSize * 1024 * 8) / (1.073741824 * duration);

                //log.info(`Initial size: ${probeOut.format.size / 1000 / 1000}MB, expected output size: ${targetTotalBitrate * duration / 8 / 1000 / 1000}MB`);

                let wantedCodecs = [(probeOut.streams[0].codec_name == "h264" ? "copy" : "libx264"), (probeOut.streams[1].codec_name == "aac" ? "copy" : "aac")];

                if (10 * audioBitrate > targetTotalBitrate) {
                    audioBitrate = targetTotalBitrate / 10;
                    if (audioBitrate < min_audio_bitrate || audioBitrate > max_audio_bitrate) audioBitrate = (audioBitrate < min_audio_bitrate ? min_audio_bitrate : max_audio_bitrate);
                }
                let videoBitrate = targetTotalBitrate - audioBitrate;

                ffmpeg(videoInputPath, { logger: log })
                    .outputOptions([
                        '-b:v ' + videoBitrate,
                        '-b:a ' + audioBitrate,
                        '-preset ultrafast'
                    ])
                    .on('error', rej)
                    .on('end', () => {
                        fs.unlinkSync(videoInputPath);
                        log.info(`Encode done`);
                        res(videoOutputPath);
                    })
                    .save(videoOutputPath);
            } else {
                //small enough
                log.info(`Not encoding ${videoInputPath}, already small enough`);
                fs.renameSync(videoInputPath, videoOutputPath)
                res(videoOutputPath);
            }
        });
    });
}

function restartBot() {
    setTimeout(function () {
        process.on("exit", function () {
            require("child_process")
                .spawn(
                    process.argv.shift(),
                    process.argv,
                    {
                        cwd: process.cwd(),
                        detached: true,
                        stdio: "inherit"
                    }
                );
        });
        process.exit();
    }, 1000);
}

client.login('OTQ2MTA3MzU1MzE2MjUyNzYz.YhZ5Iw.irFGSrHQI7j-1SaOYsZu4YbeydI');