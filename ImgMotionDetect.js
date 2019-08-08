Module.register("ImgMotionDetect", {

	// Module config defaults.
	defaults: {
        width:320, 
        height: 180,
        includeMotionBox: true,
        scoreThreshold: 400,
        maxHold: 5,  //seconds
		refrTime: 2, //seconds
		url: '',
		mask:[0,0,0,0], //xmin, xmax, ymin, ymax
		yoffset: 0,
	},


	// Define required scripts.
	getScripts: function() {
		return [];
	},

	// Define start sequence.
	start: function() {
		Log.info("Starting module: " + this.name);
		this.canvas = document.createElement('canvas');
        this.canvas.width = this.config.width;
        this.canvas.height = this.config.height;
        this.ctx = this.canvas.getContext('2d'); 

		this.canvas.style.transform = `translateY(${this.config.yoffset}%)`;


        var self = this;
		
		self.sendSocketNotification("UPDATE_CAM", self.config);
		//self.updateDom();
		// Schedule update timer.
		setInterval(function() {
			// self.updateDom();
			self.sendSocketNotification("UPDATE_CAM", self.config);
		}, self.config.refrTime*1000);
	},




	// Override dom generator.
	getDom: function() {
		var self = this;
		
		if (this.displayData && this.displayData.display){
			this.ctx.putImageData(new ImageData(new Uint8ClampedArray(this.displayData.imgData.data), this.config.width), 0, 0);

			this.ctx.strokeStyle = '#f00';
			this.ctx.strokeRect(
				this.displayData.motionBox.x.min + 0.5,
				this.displayData.motionBox.y.min + 0.5,
				this.displayData.motionBox.x.max - this.displayData.motionBox.x.min,
				this.displayData.motionBox.y.max - this.displayData.motionBox.y.min
			);
			this.canvas.style.display = 'block';
		} else {
			
			this.canvas.style.display = 'none';
		}

		return this.canvas;
	},

	// Override notification handler.
	notificationReceived: function(notification, payload, sender) {
		//
    },
    
    socketNotificationReceived: function(notification, payload){
        if (notification === "UPDATE_CAM_IMG") {
			this.displayData = payload;
			this.updateDom();
		}
	},
	



});