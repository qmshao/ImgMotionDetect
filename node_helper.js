const NodeHelper = require("node_helper");
const request = require("request");
const pixelmatch = require('pixelmatch');
const PNG = require('pngjs').PNG;
const jpeg = require('jpeg-js');
const sharp = require('sharp');

module.exports = NodeHelper.create({

    start: function () {

        console.log("Starting node helper for: " + this.name);

        this.expressApp.get("/showcam", (req, res) => {
            this.hold = this.config.maxHold / this.config.refrTime;
            res.send('Done');
        });

        this.expressApp.get("/screenswitch/:onoff", (req, res) => {
            this.screenOn = req.params.onoff.toUpperCase() === "ON";
        });

        this.screenOn = true;

    },

    socketNotificationReceived: function (notification, payload) {

        // payload is the config

        if (notification === "UPDATE_CAM") {
            if (!this.screenOn) return;
            this.config = payload;
            if (!this.diffData) {
                this.diffData = new PNG({ width: this.config.width, height: this.config.height });
            }
            this.getImg(this.config);
        } else if (notification === "SHOW_CAM") {
            this.hold = this.config.maxHold / this.config.refrTime;
        } 
    },



    getImg: function (config) {

        if (this.processing) {
            return;
        }

        this.processing = true;

        let self = this;

        request({ url: self.config.url, encoding: null }, (err, resp, body) => {

            if (err) {
                this.processing = false;
                return;
            }

            sharp(body).resize({ width: self.config.width, height: self.config.height }).toBuffer()
                .then(img => {
                    this.processImg(img);
                });
        });

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
                y > this.config.height * this.config.mask[2] / 100 &&
                y <= this.config.height * this.config.mask[3] / 100) {
                rgba[i] = 255;
                rgba[i + 1] = 255;
                rgba[i + 2] = 255;
            }
        }
        return imgData;
    },


    processImg: function (img) {

        let imgData = this.preprocessImg(img);
        let  display, motionBox = undefined;

        if (this.prevImgData) {
            let score = pixelmatch(this.prevImgData.data, imgData.data, this.diffData.data, this.config.width, this.config.height, { threshold: 0.1, alpha: 0, includeAA: true, });

            if (score > this.config.scoreThreshold) {
                motionBox = this.processDiff(this.diffData);
            }

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
        this.lastMotionBox = motionBox || this.lastMotionBox;

        this.sendSocketNotification('UPDATE_CAM_IMG', { imgData: display ? imgData : null, display, motionBox });
        this.processing = false;

    },


    processDiff: function (diffData) {
        let rgba = diffData.data;

        // pixel adjustments are done by reference directly on diffImageData
        let motionBox = undefined;

        // for (let i = 0; i < rgba.length; i += 4) {

        //     if (rgba[i + 1] == 0) {
        //         if (this.config.includeMotionBox) {
        //             let x = i / 4 % this.config.width;
        //             let y = Math.floor(i / 4 / this.config.width);
        //             motionBox = this.calculateMotionBox(motionBox, x, y);
        //         }
        //     }
        // }
        let step = 5, thres = ~~(step*step/2);
        let height = this.config.height, width = this.config.width;
        for (let yy = 0; yy < height / step; yy++) {
            for (let xx = 0; xx < width / step; xx++) {
                let ymax = Math.min(yy * step + step, height);
                let xmax = Math.min(xx * step + step, width);
                let cnt = 0;
                for (let y = yy * step; y < ymax; y++) {
                    for (let x = xx * step; x < xmax; x++) {
                        let i = (y * width + x) * 4;
                        if (rgba[i + 1] == 0) {
                            if (this.config.includeMotionBox) {
                                cnt++;
                            }
                        }
                    }
                }
                if (cnt>thres){
                    motionBox = this.calculateMotionBox(motionBox, xx*step, yy*step);
                }
            }
        }

        return motionBox;
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