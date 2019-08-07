const NodeHelper = require("node_helper");
const request = require("request");
const pixelmatch = require('pixelmatch');
const PNG = require('pngjs').PNG;
const jpeg = require('jpeg-js');
// const sharp = require('sharp');
const Jimp = require('jimp');

module.exports = NodeHelper.create({

    start: function () {

        console.log("Starting node helper for: " + this.name);

    },

    socketNotificationReceived: function (notification, payload) {

        // payload is the config
        if (notification === "UPDATE_CAM") {
            this.getImg(payload);
        }
    },



    getImg: function (config) {

        this.config = config;

        let self = this;

        if (!self.config.sharp) {
            Jimp.read(self.config.url)
                .then(raw => {
                    raw.resize(self.config.width, self.config.height).getBuffer(Jimp.MIME_JPEG, (err, img) => {
                        this.processImg(img);
                    });

                })
                .catch(err => {
                    console.log('insdie jimp');
                    console.log(err);
                });
        } else {
            if (!self.sharp){
                self.sharp = require('sharp');
            }
            request({ url: self.config.url, encoding: null }, (err, resp, body) => {
                self.sharp(body).resize({ width: self.config.width, height: self.config.height }).toBuffer()
                    .then(img => {
                        this.processImg(img);
                    });
            });
        }
    },

    preprocessImg: function (img) {
        let imgData = jpeg.decode(img);
        // put a cover
        let rgba = imgData.data;
        for (var i = 0; i < rgba.length; i += 4) {

            let x = i / 4 % this.config.width;
            let y = Math.floor(i / 4 / this.config.width);
            if (x > this.config.width * this.config.mask[0] / 100 &&
                x <= this.config.width * this.config.mask[1] / 100 &&
                y > this.config.width * this.config.mask[2] / 100 &&
                y <= this.config.width * this.config.mask[3] / 100) {
                rgba[i] = 255;
                rgba[i + 1] = 255;
                rgba[i + 2] = 255;
            }
        }
        return imgData;
    },


    processImg: function (img) {

        let imgData = this.preprocessImg(img);
        let diff, display, motionBox;

        if (this.prevImgData) {
            let diffData = new PNG({ width: this.config.width, height: this.config.height });
            pixelmatch(this.prevImgData.data, imgData.data, diffData.data, this.config.width, this.config.height, { threshold: 0.1, alpha: 0, includeAA: true, });

            diff = this.processDiff(diffData);
            motionBox = diff.motionBox;

            if (!motionBox) {
                if (this.hold > 0) {
                    this.hold--;
                    motionBox = this.lastMotionBox;
                    display = true;
                } else {
                    display = false;
                }
            } else {
                this.hold = this.config.maxHold / this.config.refrTime;
                display = true;
            }


        }

        this.prevImgData = imgData;
        this.lastMotionBox = diff && diff.motionBox || this.lastMotionBox;
        this.sendSocketNotification('UPDATE_CAM_IMG', { imgData, display, motionBox });

    },


    processDiff: function (diffData) {
        let rgba = diffData.data;

        // pixel adjustments are done by reference directly on diffImageData
        let score = 0;
        let motionBox = undefined;

        for (let i = 0; i < rgba.length; i += 4) {

            if (rgba[i + 1] == 0) {
                score++;

                if (this.config.includeMotionBox) {
                    let x = i / 4 % this.config.width;
                    let y = Math.floor(i / 4 / this.config.width);
                    motionBox = this.calculateMotionBox(motionBox, x, y);
                }

            }
        }
        return {
            score: score,
            motionBox: score > this.config.scoreThreshold ? motionBox : undefined,
        };
    },

    calculateMotionBox: function (currentMotionBox, x, y) {
        // init motion box on demand
        let motionBox = currentMotionBox || {
            x: { min: x, max: x },
            y: { min: y, max: y }
        };

        motionBox.x.min = Math.min(motionBox.x.min, x);
        motionBox.x.max = Math.max(motionBox.x.max, x);
        motionBox.y.min = Math.min(motionBox.y.min, y);
        motionBox.y.max = Math.max(motionBox.y.max, y);

        return motionBox;
    },

});