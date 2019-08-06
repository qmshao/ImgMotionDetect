const NodeHelper = require("node_helper");
const request = require("request");
const pixelmatch = require('pixelmatch');
const sharp = require('sharp');
const PNG = require('pngjs').PNG;
const jpeg = require('jpeg-js');

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
        request({url: self.config.url, encoding: null}, (err, resp, body) => {
            sharp(body).resize({ width: self.config.width, height: self.config.height }).toBuffer()
                .then(img => {
                    let imgData = jpeg.decode(img);
                    // put a cover
                    let rgba = imgData.data;
                    for (var i = 0; i < rgba.length; i += 4) {
        
                        let x = i / 4 % self.config.width;
                        let y = Math.floor(i / 4 / self.config.width);
                        if (x>self.config.width*self.config.mask[0]/100 &&                            
                            x<=self.config.width*self.config.mask[1]/100 &&
                            y>self.config.width*self.config.mask[2]/100 &&
                            y<=self.config.width*self.config.mask[3]/100) {
                            rgba[i] = 255;
                            rgba[i+1] = 255;
                            rgba[i+2] = 255;
                        }
                    }
                    let {display, motionBox}  = self.processImg(imgData);
                    this.sendSocketNotification('UPDATE_CAM_IMG',{imgData, display, motionBox });
                });
        });
    },

    processImg(imgData) {

        let diff, display, motionBox;

        if (this.prevImgData) {
            let diffData = new PNG({ width: this.config.width, height: this.config.height });
            pixelmatch(this.prevImgData.data, imgData.data, diffData.data, this.config.width, this.config.height, { threshold: 0.1, alpha: 0, includeAA: true, });

            diff = this.processDiff(diffData);
            motionBox = diff.motionBox;
            
            if (!motionBox) {
                if (this.hold>0) {
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


            // if (motionBox) {
            //     originContext.strokeStyle = '#f00';
            //     originContext.strokeRect(
            //         motionBox.x.min + 0.5,
            //         motionBox.y.min + 0.5,
            //         motionBox.x.max - motionBox.x.min,
            //         motionBox.y.max - motionBox.y.min
            //     );
            // }
        }

        this.prevImgData = imgData;
        this.lastMotionBox = diff && diff.motionBox || this.lastMotionBox;

        return { display, motionBox };

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