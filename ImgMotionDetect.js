Module.register("ImgMotionDetect", {

	// Module config defaults.
	defaults: {
		width: 320,
		height: 180,
		includeMotionBox: true,
		scoreThreshold: 400,
		maxHold: 5,  //seconds
		refrTime: 2, //seconds
		url: '',
		mask: [0, 0, 0, 0], //xmin, xmax, ymin, ymax
		yoffset: 0,
	},


	// Define required scripts.
	getScripts: function () {
		return [];
	},

	// Define start sequence.
	start: function () {
		Log.info("Starting module: " + this.name);

		this.canvas = document.createElement('canvas');
		this.canvas.width = this.config.width;
		this.canvas.height = this.config.height;
		this.ctx = this.canvas.getContext('2d');

		this.canvas.style.transform = `translateY(${this.config.yoffset}%)`;
		this.recieved_diff = 0;



		this.sendSocketNotification("UPDATE_CAM", this.config);
		//self.updateDom();
		//Schedule update timer.
		setInterval(() => {
			// self.updateDom();
			this.sendSocketNotification("UPDATE_CAM", this.config);
			this.recieved_diff++;
			if (this.recieved_diff == this.config.maxHold) {
				this.displayData = null;
				this.updateDom();
			}
		}, this.config.refrTime * 1000);
	},




	// Override dom generator.
	getDom: function () {

		if (this.displayData && this.displayData.display) {
			this.ctx.putImageData(new ImageData(new Uint8ClampedArray(this.displayData.imgData.data), this.config.width), 0, 0);

			if (this.displayData.motionBox) {
				this.ctx.strokeStyle = '#f00';
				this.ctx.strokeRect(
					this.displayData.motionBox.x.min,
					this.displayData.motionBox.y.min,
					this.displayData.motionBox.x.max - this.displayData.motionBox.x.min,
					this.displayData.motionBox.y.max - this.displayData.motionBox.y.min
				);
			}
			this.canvas.style.display = 'block';
		} else {

			this.canvas.style.display = 'none';
		}

		return this.canvas;
	},

	// Override notification handler.
	notificationReceived: function (notification, payload, sender) {
		if (notification === "SHOW_CAM") {
			this.sendSocketNotification("SHOW_CAM", {});
		}
	},

	socketNotificationReceived: function (notification, payload) {
		if (notification === "UPDATE_CAM_IMG") {
			this.displayData = payload;
			this.recieved_diff = 0;
			this.updateDom();
		}
	},




});
