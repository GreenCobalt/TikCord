
const fs = require("fs");
const log = require("./log.js");

const ffmpeg = require('ffmpeg');
const ffprobe = require('node-ffprobe');
const ffprobeStatic = require('ffprobe-static');
ffprobe.FFPROBE_PATH = ffprobeStatic.path;

const maxVideoSize = 8 * 1048576;

function compressVideo(threadID, dir, videoInputPath, videoOutputPath, targetSize, pass) {
    let min_audio_bitrate = 32000;
    let max_audio_bitrate = 256000;

    return new Promise((res, rej) => {
        ffprobe(dir + videoInputPath).then((probeOut) => {
            // if (err) { console.log(`FFPROBE COMPRESS ERROR ${err}`); rej(err); }
            // console.log(probeOut);

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
                    rej({err: "the video file is too big to be compressed to Discord's 8MB max!", send: true});
                }
                else
                {
                    let ffmpeg_proc = new ffmpeg(dir + videoInputPath);
                    ffmpeg_proc.then(function (video) {
                        video.addCommand('-b:v', videoBitrate);
                        video.addCommand('-b:a', audioBitrate);
                        video.addCommand('-preset', 'ultrafast');
                        video.save(dir + videoOutputPath, (error, file) => {
                            if (error)
                            {
                                console.log(`FFMPEG COMPRESS ERROR ${error}`);
                                rej({err: error, send: false});
                            }

                            fs.unlinkSync(dir + videoInputPath);
                            fs.stat(file, (stat_error, stats) => {
                                log.debug(`[${threadID}] Encode done (${stats.size / 1048576}MB) - pass ${pass}`);
                                res(file);
                            });
                        });

                    }, function (err) {
                        console.log('Error: ' + err);
                    });
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