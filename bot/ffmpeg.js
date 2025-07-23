const ffmpeg = require('fluent-ffmpeg');
const fs = require("fs");

const log = require("./log.js");

const maxVideoSize = 8 * 1048576; // 20mb, discord max 25mb

function compressVideo(threadID, dir, videoInputPath, videoOutputPath, targetSize, pass) {
    let min_audio_bitrate = 32000;
    let max_audio_bitrate = 256000;

    return new Promise((res, rej) => {
        ffmpeg.ffprobe(dir + videoInputPath, (err, probeOut) => {
            if (err) { console.log(`FFPROBE COMPRESS ERROR ${err}`); rej(err); }

            // too big
            if (probeOut.format.size > maxVideoSize) {
                log.debug(`[${threadID}] Shrinking (${probeOut.format.size / 1048576}MB) - pass ${pass}`);

                let duration = probeOut.format.duration;
                let audioBitrate = probeOut.streams[1].bit_rate;
                let targetTotalBitrate = (targetSize * maxVideoSize) /* size in bits */ / (1.1 * duration);

                if (10 * audioBitrate > targetTotalBitrate) {
                    audioBitrate = targetTotalBitrate / 10;
                    if (audioBitrate < min_audio_bitrate || audioBitrate > max_audio_bitrate) audioBitrate = (audioBitrate < min_audio_bitrate ? min_audio_bitrate : max_audio_bitrate);
                }
                let videoBitrate = targetTotalBitrate - audioBitrate;

                if (videoBitrate < 0 || audioBitrate < 0 || targetTotalBitrate < 0)
                {
                    rej({e: "the video file is too big to be compressed to Discord's 8MB max!", send: true});
                }
                else
                {
                    ffmpeg(dir + videoInputPath, { logger: log })
                        .outputOptions([
                            '-b:v ' + videoBitrate,
                            '-b:a ' + audioBitrate,
                            '-preset ultrafast'
                        ])
                        .on('error', (err, stdout, stderr) => {
                            console.log(`FFMPEG COMPRESS ERROR ${err}`);
                            rej({e: err, send: false});
                        })
                        .on('end', () => {
                            fs.unlinkSync(dir + videoInputPath);
                            fs.stat(dir + videoOutputPath, (err, stats) => {
                                log.debug(`[${threadID}] Encode done (${stats.size / 1048576}MB) - pass ${pass}`);
                                res(dir + videoOutputPath);
                            });
                        })
                        .save(dir + videoOutputPath);
                }
            } else {
                //small enough
                log.debug(`[${threadID}] Not shrinking (${probeOut.format.size / 1048576}MB) - pass ${pass}`); //mebibyte
                fs.renameSync(dir + videoInputPath, dir + videoOutputPath);
                res(dir + videoOutputPath);
            }
        });
    });
}

module.exports = { compressVideo };