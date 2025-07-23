const sharp = require('sharp');
const https = require('https');
const fs = require("fs");
const { exec } = require("child_process");

const ffmpegutils = require("./ffmpeg.js");
const log = require("./log.js");

// const api = "douyin.wtf";
const api = "192.168.1.38:9000"

const VidTypes = {
    Video: 'Video',
    Slideshow: 'Slideshow',
    Invalid: 'Invalid'
};

const axios = require('axios');
const getURLContent = (url) => axios({ url, responseType: 'arraybuffer' }).then(res => res.data);

let ramDisk;
function init(disk) {
    ramDisk = disk;
}

sharp.cache(false);

function getTikTokData(threadID, url) {
    return new Promise((res, rej) => {
        log.debug(`[${threadID}] Fetching data from API for ${url}`);

        const urlRe = /https:\/\/(www\.)?tiktok\.com\/@?(?<user>.*?)\/(video|photo)\/(?<id>\d*)/.exec(url);
        if (!urlRe) {
            res([VidTypes.Invalid, "link is not a valid TikTok video!", false]);
        }

        log.debug(`[${threadID}] Regex returned ID ${urlRe.groups.id}`);
        // log.debug(`[${threadID}] Requesting http://${api}/api/hybrid/video_data?url=${url}`);
        axios({
            method: 'get',
            url: `http://${api}/api/hybrid/video_data?url=${url}`
        })
        .then(function (response) {
            let result = response.data;
            log.debug(`[${threadID}] API Data Length ${JSON.stringify(result).length}`);

            if (Object.keys(result.data).includes("image_post_info")) {
                let images = [];
                result.data.image_post_info.images.forEach((img) => {
                    images.push(img.display_image.url_list[0]);
                });
                res([VidTypes.Slideshow, images, result.data.music.play_url.url_list[0]]);
            } else if (result.data.video.height > 0) {
                res([VidTypes.Video, result.data.video.play_addr.url_list[0]]);
            } else {
                res([VidTypes.Invalid, "unknown video type!", false]);
            }
        })
        .catch(function (error) {
            rej({err: error, send: false});
        });
    });
}

function downloadVideo(threadID, ogURL, vidURL) {
    return new Promise((res, rej) => {
        if (vidURL == undefined) {
            log.warn("vidURL is undefined!");
            rej("NOTFOUND");
        } else {
            let id = ogURL.split("?")[0].split("/")[5];

            let dir = `${ramDisk.name}/videos/`;
            let ogName = `${id}_${threadID}_encode.mp4`;
            let pass1Name = `${id}_${threadID}_pass1.mp4`;
            //let pass2Name = `${ramDisk.name}/videos/${id}_${threadID}.mp4`;

            //console.log(vidURL);
            getURLContent(vidURL).then((content) => {
                fs.writeFileSync(dir + ogName, content);
                log.info(`[${threadID}] Downloaded successfully to ${dir + ogName}`);

                ffmpegutils.compressVideo(threadID, dir, ogName, pass1Name, 8, 1)
                    .then((compressedName) => {
                        res(compressedName);
                    })
                    .catch((e) => { rej(e); });
            }).catch((e) => { rej({err: e, send: false}); });
        }
    });
}

function downloadSlide(threadID, ogURL, imageURLs, audioURL) {
    return new Promise((res, rej) => {
        let id = ogURL.split("?")[0].split("/")[5];
        let promises = [];

        // create audio download promise
        promises.push(new Promise((res, rej) => {
            let filePath = `${ramDisk.name}/images/${id}_${threadID}_0.mp3`;
            let file = fs.createWriteStream(filePath);

            let request = https.get(audioURL, function (response) {
                response.pipe(file);
                file.on("finish", () => {
                    file.close();
                    res(`${ramDisk.name}/images/${id}_${threadID}_0.mp3`);
                });
            });

            request.on("error", (err) => {
                file.close(() => {
                    fs.unlinkSync(filePath);
                });
            });
        }));

        // create image download promises
        Object.keys(imageURLs).forEach((imageURLkey) => {
            promises.push(new Promise((res, rej) => {
                let filePath = `${ramDisk.name}/images/${id}_${threadID}_${imageURLkey}.jpg`;
                let file = fs.createWriteStream(filePath);

                let request = https.get(imageURLs[imageURLkey], function (response) {
                    response.pipe(file);
                    file.on("finish", () => {
                        file.close(() => {
                            sharp(`${ramDisk.name}/images/${id}_${threadID}_${imageURLkey}.jpg`)
                                .toColourspace('srgb')
                                .toFile(`${ramDisk.name}/images/${id}_${threadID}_${imageURLkey}_c.jpg`, (err, info) => {
                                    if (err) { rej(err); return; }

                                    fs.unlinkSync(`${ramDisk.name}/images/${id}_${threadID}_${imageURLkey}.jpg`);
                                    res(`${ramDisk.name}/images/${id}_${threadID}_${imageURLkey}_c.jpg`);
                                });
                        });
                    });
                });

                request.on("error", (err) => {
                    file.close(() => {
                        fs.unlinkSync(filePath);
                    });
                });
            }));
        });

        // execute all promises and wait for completion
        Promise.all(promises).then((results) => {
            let dir = `${ramDisk.name}/videos/`;
            let videoName = `${id}_${threadID}.mp4`;
            let pass1Name = `${id}_${threadID}_pass1.mp4`;

            // removed -shortest
            let ffmpegExec = exec(`ffmpeg -hide_banner -loglevel error -r 1/2.5 -start_number 0 -i ${ramDisk.name}/images/${id}_${threadID}_%01d_c.jpg -i ${ramDisk.name}/images/${id}_${threadID}_0.mp3 -map 0 -map 1 -c:v libx264 -vf "scale=\'if(gt(a*sar,16/9),640,360*iw*sar/ih)\':\'if(gt(a*sar,16/9),640*ih/iw/sar,360)\',pad=640:360:(ow-iw)/2:(oh-ih)/2,setsar=1" -r 30 -pix_fmt yuv420p ${ramDisk.name}/videos/${videoName}`, (error, stdout, stderr) => {
                if (error || stderr) { console.log(`FFMPEG SLIDESHOW ERROR: ${error}, ${stderr}`); return; }
            });
            ffmpegExec.stdout.pipe(process.stdout);
            ffmpegExec.on('exit', function () {
                results.forEach((f) => {
                    fs.unlinkSync(f);
                });

                ffmpegutils.compressVideo(threadID, dir, videoName, pass1Name, 8, 1).then((encodedName) => {
                    res(encodedName);
                }).catch((e) => { rej(e); });
            });
        });
    });
}

module.exports = { init, VidTypes, getTikTokData, downloadVideo, downloadSlide };