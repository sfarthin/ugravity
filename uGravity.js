!function (name, definition) {
	// based on https://github.com/ded/domready for best support
	if (typeof module != 'undefined') module.exports = definition()
	else if (typeof define == 'function' && typeof define.amd == 'object') define(definition)
	else this[name] = definition()
}('uGravity', function(uGravity) {
	// Variable to catch data from jsonp datafiles until the onload method triggers. We then
	// assign these options to the appropriate canvas.
	var jsonp_opts;
	
	
    // Helper method, Fill in a given object with default properties.
     var extend = function(obj) {
       Array.prototype.slice.call(arguments, 1).forEach(function(source) {
         if (source) {
           for (var prop in source) {
             obj[prop] = source[prop];
           }
         }
       });
       return obj;
     };
	
	/**
	*
	* Entry Point, managing all the parts neccessary to run the simulation.
	*
	*/
	function uGravity(canvas, opts) {
	
		// If canvas is not given lets assume its a data file (jsonp file)
		if(!opts && typeof canvas == "object") {
			jsonp_opts = canvas;
			return;
		}
		
		// Lets ensure this is an instance while also allowing the uGravity(canvas,opts) syntax
	    if (!(this instanceof uGravity)) {
			return new uGravity(canvas, opts);
	    }
		
			// A reference to our visible canvas
		var mousedown = false,
			last_position_x,
			last_position_y;
		

		// A reference to the in-memory canvas used as a back buffer 
        var backBuffer = document.createElement('canvas');
        backBuffer.width = canvas.width;
        backBuffer.height = canvas.height;
        var ctx = backBuffer.getContext('2d');

		// Creation of our inline worker to do our physics
		var blob = new Blob(["("+PhysicsWorker.toString()+")()"]),
			blobURL = window.URL.createObjectURL(blob),
			runningWorker;
		
		/**
		*
		* This method sets up everything.
		*
		**/
		this.init = function() {
		
			this.load(opts);
		
			/**
			*
			* Allow user to to zoom by using the scroll wheel.
			*
			**/
			canvas.addEventListener('mousewheel', function(e) {
				var wheelData = e.detail ? e.detail * -1 : e.wheelDelta / 1000;
			
				// need to scale into the position of the cursor;
				this.scale *= 1 + wheelData;
				if(this.scale < 0)
					this.scale = 0.001;
				
				this.zooming = true;

				e.stopPropagation();
				e.preventDefault();
			
				if(!runningWorker) this.render();
			
				return false;
			}.bind(this), false);  
				

			/**
			*
			* Allow user to Pan by click and dragging.
			*
			**/
			canvas.addEventListener ("mousedown", function (event) { mousedown = true; });		
			canvas.addEventListener ("mouseup", function (event) { mousedown = false; last_position_x = null; last_position_y = null; });
			canvas.addEventListener ("mousemove", function (event) {
				if(mousedown) {
		            var x = event.clientX;
		            var y = event.clientY;
			
					if(last_position_x && last_position_y) {
						this.offsetX += ((x - last_position_x)/this.scale)*2;
						this.offsetY += ((y - last_position_y)/this.scale)*2;
					}
			
					last_position_x = x;
					last_position_y = y;
				
			
					if(!runningWorker) this.render();
				
				}
			
	        }.bind(this));
			
		
			// If the options has the simulation start automatically, so be it.
			if(this.state == "start") this.start();
		}
		
		/**
		*
		* Load up our specific simulation options
		*
		**/
		this.load = function(opts) {
			// If we are running lets start it over after the settings update.
			var restart = !!runningWorker;
			this.stop();
			
			// Lets feed in all our settings
			extend(this, {
				
				// title of this project
				title: "",
				
				// Objects with mass
				objects: [],
				
				// Zoom Level
				scale: 80,
				
				// Panning of the screen
				offsetX: 0,
				offsetY: 0,
				
				// how fast time is moving 1x, 10x, etc
				timeScale: 1,
				
				// "start" or "stop" indicates whether its running or not.
				state: 'stop',
				
				// Frames per second for rendering
				fps: 30,
				
				// About how many cells accross fo the graph paper
				cellsAccross: 10,
			}, this.export(), opts);
	
			if(restart) {
				this.start();
			} else {
				this.render();				
			}

		};

		/**
		*
		* Export state and settings
		*
		**/
		this.export = function() {
			// Clone settings and return it
			return JSON.parse(JSON.stringify(this));	
		}

		/**
		*
		* Set scale in such that all objects are visible and set the viewport to be centered on the "center of gravity".
		*
		**/
		this.normalize = function() {
			
			// Lets set the center of the viewport to the center of gravity
			this.offsetX = 0;
			this.offsetY = 0;
			
			var max_scale = 0,
				objects = this.objects;

			// Lets find what scale would allow the object to be visible if the viewport is centered at 0,0 (center of gravity).
			if(objects.length > 1) {

				for(var i in objects) {
					var object = objects[i],
						max_scale_x  = Math.abs((canvas.width/ 2 - 70) / (object.x + object.radius)),// - (canvas.width/4),
						max_scale_y  = Math.abs((canvas.height/ 2 - 70) / (object.y + object.radius)),// - (canvas.height/4),
						obj_scale = ((max_scale_x < max_scale_y && max_scale != Infinity) || max_scale_y == Infinity ? max_scale_x : (max_scale_y != Infinity ? max_scale_y : null));
						
						if(obj_scale && !max_scale || max_scale > obj_scale) {
							max_scale = obj_scale;
						}
					
				}

				// Lets refresh our screen, if planets are screwy lets not normalize or we'll freeze the screen.
				if(max_scale > 0 && max_scale < Infinity) this.scale = max_scale;
				this.render();
					
			} else if(objects.length == 1) {
				var scale = Math.abs((canvas.height/ 2 - 70) / (this.objects[0].radius)) - (canvas.height/ 8);
				
				if(scale < Infinity && scale > 0) {
					this.scale = scale;
					this.render();
				}
			} else if(!objects.length){
				this.scale = 1;
				this.render();
			}
			
		}

	    /**
		*
		* Controls for running the simulation
		*
		**/		
		this.stop = function() {
			try { runningWorker.terminate();} catch(e) {}
			runningWorker = null;
		}
		
		this.start = function() {
			
			// Lets destory any workers that exisited before and create a new worker.
			try { runningWorker.terminate();} catch(e) {}
			runningWorker = new Worker(blobURL);
			runningWorker.onmessage = this.onmessage;
			runningWorker.postMessage(this.export());
		}
		
		/**
		*
		* Handles messages from our worker
		*
		**/
		this.onmessage = function(msg) {
			
			var data = msg.data,
				cmd  = data.cmd;

			switch(cmd) {
				case "render": 
					// Lets take in all the new State the Physics Worker gave us, and render the page.
					this.objects = data.objects;
					this.elapsedTime = data.elapsedTime;
					this.render(); 
					return;
				
				// @todo allow messages to be printed to the screen.
				case "print": console.log(data); return;
			}
			
		}.bind(this);

		/**
		*
		* Renders our scene
		*
		**/		
	    this.render = function () {
			
			var live_ctx = canvas.getContext('2d');
    
	        // Clear our drawing contexts
	        ctx.clearRect(0, 0, backBuffer.width, backBuffer.height);
	        live_ctx.clearRect(0, 0, canvas.width, canvas.height);

			/**
			*
			* Application rendering
			*
			**/
			
			// Lets center the viewport on the center of gravity.
			var avg_x = 0, avg_y = 0, total_mass = 0;
			
			this.objects.forEach(function(object) { total_mass += object.mass; });
			this.objects.forEach(function(object) {
				avg_x += object.x * (object.mass/total_mass);
				avg_y += object.y * (object.mass/total_mass);
			});			
			for(var i in this.objects) {
				this.objects[i].x = this.objects[i].x - avg_x;
				this.objects[i].y = this.objects[i].y - avg_y;
			}
			
			// Lets get a cell width that about fits the amount of squares accross.
			var cellWidth 	= this.scale;
			while(canvas.width / cellWidth > this.cellsAccross/2) { cellWidth = cellWidth * 2; }
			while(canvas.width / cellWidth < this.cellsAccross/2) { cellWidth = cellWidth / 2; }
			this.cellWidth = cellWidth;

			// Draw our graph paper
			this.drawGraphPaper();

	        // Draw our objects onto the back buffer
	        for (x in this.objects) {
	            this.drawObject(this.objects[x]);
	        }
			
			// Draw Scale box in left bottom corner.
			this.drawScaleBox();
			
			this.drawTimeBox();
			
			// Lets draw labels for objects that are too small
			this.drawLabels();
			
			this.drawTitle();
			
			/**
			*
			* Finished rendering our application
			*
			**/
    
	        // copy the back buffer to the displayed canvas
	        live_ctx.drawImage(backBuffer, 0, 0);
	    };
		
		this.drawTitle = function() {

			ctx.font = '72px Helvetica'; //HelveticaNeue-Light
			var width 		= ctx.measureText(this.title).width;
			
			ctx.textBaseline = "top"
			ctx.shadowColor = "#000"
			ctx.shadowBlur = 15;
			ctx.fillStyle = "#FFF";
			ctx.strokeStyle = "#000";
			ctx.lineWidth = 7;

			ctx.strokeText(this.title, canvas.width / 2 - width / 2, 20);
			ctx.fillText(this.title, canvas.width / 2 - width / 2, 20);

			ctx.textBaseline = "bottom";
			ctx.shadowColor = null;
			ctx.shadowOffsetX = 0;
			ctx.shadowOffsetY = 0;
			ctx.shadowBlur = 0;
			
			
		};
		
		this.drawLabels = function() {
			
			var objects 	= this.objects,
				leftEdge 	= (this.scale * this.offsetX) + canvas.width/2,
				rightEdge 	= (this.scale * this.offsetX) - canvas.width/2,
				topEdge 	= (this.scale * this.offsetY) - canvas.height/2,
				bottomEdge  = (this.scale * this.offsetY) + canvas.height/2,
				paintArrow = function(x, y, dir) {


					ctx.beginPath();
					ctx.moveTo(x, y);

					if(dir == "down") {
						ctx.lineTo(x + 15, y + 30);
						ctx.lineTo(x, y + 25);
						ctx.lineTo(x - 15, y + 30);
						ctx.lineTo(x,y);	
					} else if(dir == "left") {
						ctx.lineTo(x + 30, y + 15);
						ctx.lineTo(x + 25, y);
						ctx.lineTo(x + 30, y - 15);
						ctx.lineTo(x,y);
					} else if(dir == "right") {
						ctx.lineTo(x - 30, y - 15);
						ctx.lineTo(x - 25, y);
						ctx.lineTo(x - 30, y + 15);
						ctx.lineTo(x,y);
					} else if(!dir) {
						ctx.lineTo(x - 15, y - 30);
						ctx.lineTo(x, y - 25);
						ctx.lineTo(x + 15, y - 30);
						ctx.lineTo(x,y);
					} else {
						// @todo Use some trig to have arrow wrap around corner.
						// ------
					}	// \
						//	\
					
					ctx.fillStyle = object.color;
					ctx.fill();
					
					ctx.lineWidth = 2;
					ctx.strokeStyle = "#000";
					ctx.stroke();
					
				};
			
			for(var i in objects) {
				var object = this.objects[i],
					radius = this.scale * object.radius,
					x = (this.scale * (object.x + this.offsetX)) + canvas.width/2,
					y = (this.scale * (object.y + this.offsetY)) + canvas.height/2,
					x2 = (this.scale * object.x) * -1,
					y2 = (this.scale * object.y) * -1;
				
				if(bottomEdge < y2 - 20) {
					paintArrow(x,0,"down");
				} else if(topEdge > y2 + 20) {
					paintArrow(x,canvas.height);
				} else if(leftEdge < x2) {
					paintArrow(0,y,"left");
				} else if(rightEdge > x2) {
					paintArrow(canvas.width,y,"right");
				} else if(radius < 6) {
					
					// upside down arrow ontop of page.
					// if(topEdge - 150 > y2) {
					// 	y += radius + 10;
					// 	paintArrow(x,y,true);
					// } else {
						// Lets make sure the arrow is on top of the object.
						paintArrow(x,y - radius - 10);
						//}

				}
				
				
				
			}
			
		};
		
		this.drawScaleBox = function() {
			function addCommas(nStr) {
				nStr += '';
				x = nStr.split('.');
				x1 = x[0];
				x2 = x.length > 1 ? '.' + x[1] : '';
				var rgx = /(\d+)(\d{3})/;
				while (rgx.test(x1)) {
					x1 = x1.replace(rgx, '$1' + ',' + '$2');
				}
				return x1 + x2;
			}
			
			var cellWidthText, units;
			
			if(this.cellWidth / this.scale > 0.01) {
				cellWidthText = Math.round(this.cellWidth / this.scale * 100000) / 100000;
				units = "AU";
			} else {
				cellWidthText = Math.round(this.cellWidth / this.scale * 1.496e+8);
				units = "km";
			}
				
				

			ctx.font = '24px HelveticaNeue-Light';
			
			var roundedScale = addCommas(cellWidthText) + " " + units,
				textWidth 	 = ctx.measureText(roundedScale).width,
				height 		= 40,
				padding 	= 20,
				textPadding	= 8,
				width = textPadding * 3 + padding + textWidth + this.cellWidth;
			
			ctx.fillStyle = "#FFF";
			ctx.strokeStyle = "black";
			ctx.shadowBlur = 15;
			ctx.fillRect(padding,canvas.height - height - padding,width,height);
			ctx.shadowBlur = 0;
			
			ctx.lineWidth = 2;
			ctx.strokeRect(padding, canvas.height - height - padding, width, height);
			
			ctx.fillStyle = "#000000";
			ctx.fillText(roundedScale,padding + textPadding + 5,canvas.height - padding - textPadding);
			
			ctx.beginPath();
			ctx.lineWidth = 3;
			ctx.moveTo(padding + 3 * textPadding + textWidth, canvas.height - (1.5*padding) - textPadding - 5);
			ctx.lineTo(padding + 3 * textPadding + textWidth, canvas.height - padding - textPadding - 5);
			ctx.lineTo(padding + 3 * textPadding + textWidth + this.cellWidth, canvas.height - padding - textPadding - 5);
			ctx.lineTo(padding + 3 * textPadding + textWidth + this.cellWidth, canvas.height - (1.5*padding) - textPadding - 5);
			ctx.stroke();
			
			
		};
		
		this.drawTimeBox = function() {
			function addCommas(nStr) {
				nStr += '';
				x = nStr.split('.');
				x1 = x[0];
				x2 = x.length > 1 ? '.' + x[1] : '';
				var rgx = /(\d+)(\d{3})/;
				while (rgx.test(x1)) {
					x1 = x1.replace(rgx, '$1' + ',' + '$2');
				}
				return x1 + x2;
			}
			
			var text;

			text = Math.round(this.elapsedTime) + " seconds";
			
			if(this.elapsedTime > 60 * 5) {
				text = addCommas(Math.round(this.elapsedTime/60)) + " minutes";
			}
			if(this.elapsedTime > 60 * 60 * 5) {
				text = addCommas(Math.round(this.elapsedTime/60/60)) + " hours";
			}
			if(this.elapsedTime > 60 * 60 * 24 * 5) {
				text = addCommas(Math.round(this.elapsedTime/60/60/24)) + " days";
			}
			if(this.elapsedTime > 60 * 60 * 24 * 365 * 10) {
				text = addCommas(Math.round(this.elapsedTime/60/60/24/365)) + " years";
			}

			// 	units = "AU";
			// } else {
			// 	cellWidthText = Math.round(this.cellWidth / this.scale * 1.496e+8);
			// 	units = "km";
			// }
				
				

			ctx.font = '24px HelveticaNeue-Light';
			
			var textWidth 	 = ctx.measureText(text).width,
				height 		= 40,
				padding 	= 20,
				textPadding	= 8,
				width = textPadding + padding + textWidth;
			
			ctx.fillStyle = "#FFF";
			ctx.strokeStyle = "black";
			ctx.shadowBlur = 15;
			ctx.fillRect(canvas.width - padding - width,canvas.height - height - padding,width,height); // 
			ctx.shadowBlur = 0;
			
			ctx.lineWidth = 2;
			ctx.strokeRect(canvas.width - padding - width, canvas.height - height - padding, width, height); // canvas.height - 
			
			ctx.fillStyle = "#000000";
			ctx.fillText(text, canvas.width - (padding + textPadding - 20) - width, canvas.height - padding - textPadding); 
			
		};
		
		
		this.drawGraphPaper = function() {
			var cellWidth 	= this.cellWidth; 
			
				// Lets make sure that 0,0 is an intersection of graph lines
			var yAlignment = (canvas.height / 2) % cellWidth,
				xAlignment = (canvas.width  / 2) % cellWidth,
				
				// lets determine the first position of the graph lines inside the viewport in respect to the offest from point 0,0
				startX = (this.offsetX * this.scale) % cellWidth + xAlignment,
				startY = ((this.offsetY * this.scale) % cellWidth) + yAlignment;
			
			/**
			*
			* x,y values refer to the x,y cordinates in respect to the canvas
			*
			**/
			
			for(var x = startX; x <= canvas.width; x+= cellWidth) {
				
				var point = Math.abs((x - canvas.width/2)/this.scale - this.offsetX);
				
				ctx.lineWidth = 1;
				ctx.strokeStyle = "#ccc";
			    ctx.beginPath();
			    ctx.moveTo(x,0);
			    ctx.lineTo(x,canvas.height);
			    ctx.stroke();
			}
			
			for(var y = startY; y <= canvas.height; y+= cellWidth) {
				
				var point = Math.abs((y - canvas.height/2)/this.scale - this.offsetY);
				
				ctx.lineWidth = 1;
				ctx.strokeStyle = "#ccc";
			    ctx.beginPath();
			    ctx.moveTo(0,y);
			    ctx.lineTo(canvas.width,y);
			    ctx.stroke();
			}
			
			
			
			ctx.beginPath();
			
			var centerX = (this.scale * this.offsetX) + canvas.width/2,
				centerY = (this.scale * this.offsetY) + canvas.height/2;
			
			ctx.arc(centerX,centerY,3,0,Math.PI*2,true); // Outer circle
			
			ctx.fillStyle = '#000';
			ctx.fill();
			
			
			
		}

		/**
		*
		* Render an individual object
		*
		**/
		this.drawObject = function(object) {

			object.scaledX 		= (this.scale * (object.x + this.offsetX)) + canvas.width/2;
			object.scaledY 		= (this.scale * (object.y + this.offsetY)) + canvas.height/2;
			object.scaledRadius = this.scale * object.radius;
	
			ctx.beginPath();
			ctx.arc(object.scaledX,object.scaledY,object.scaledRadius,0,Math.PI*2,true);
			ctx.fillStyle = object.color;
			ctx.lineWidth = 0;
			ctx.fill();
		}
		
		this.init();
		
		return this;
	}
	
	function PhysicsWorker() {
		// NOTE: Assume nothing about the host environment or scope because this is thrown in an inline web worker

		/**
		*
		* This worker expects options, and will start running the simulation when it recieves them.
		*
		**/
		onmessage = function(msg) {
			var opts = msg.data,
				//numFrames = 0,
				
				// These variables keep track of time passed.
				elapsedTime = opts.elapsedTime,
				lastFrame 	= new Date().getTime(),
				lastRender	= new Date().getTime(),
				seconds_between_frames = 1 / opts.fps;
		
			/**
			*
			* Lets make the physics as continuous as possible.
			*
			**/
			while(1) {
			
				//numFrames++;
			
					// calculate the time since the last frame
		        var thisFrame = new Date().getTime(),
					
					// Lets see the time difference (seconds)
					dt = (thisFrame - lastFrame)/1000 * opts.timeScale;
				
				// Lets keep track of the elapsed time.
				elapsedTime += dt;
				
				// lets set our lastFrame for next time.
		        lastFrame = thisFrame;
			
				if(seconds_between_frames < (thisFrame - lastRender)/1000) {
					// Lets indicate its time to render
					postMessage({cmd: "render", objects: opts.objects, elapsedTime: elapsedTime});
					//numFrames = 0;
					lastRender = thisFrame;
				}

				// Lets apply Universal Gravity from all objects, applied to all other objects.
				for(var i in opts.objects) {
					var object = opts.objects[i];
				
					for(var j in opts.objects) {
						var otherObject = opts.objects[j];
				
						if(otherObject.mass && otherObject.name != object.name) {
	
							// http://www.arachnoid.com/ruby/gravity/index.html
							var getDistance 	= function(a,b) { return Math.pow(Math.pow(b[1]-a[1], 2) + Math.pow(b[0]-a[0], 2), 0.5); },
						
								m_in_au = 1.496e11,
						
								G 				= 6.674*Math.pow(10, -11),
			
								// distance formula
								slope 			= (otherObject.y - object.y)/(otherObject.x - object.x),
								angle 			= Math.atan(slope),
								distance 		= getDistance([otherObject.x, otherObject.y], [object.x, object.y])*m_in_au, // AU to meters
								
								// N*(m^2/kg^2) * (kg * kg) / m = N*m = 1kg*m^2/s^2
								
								force  			= G * (object.mass * otherObject.mass) / Math.pow(distance, 2) / m_in_au, 	// F = ma = 1kg(m/s^2)
	
								// http://zonalandeducation.com/mstm/physics/mechanics/forces/forceComponents/forceComponents.html
								xForce = force * Math.cos(angle),
								yForce = force * Math.sin(angle),
	
								//a = f/m1 because F = m*a
								// lets then convert m/s^2 to AU/s^2
								xAcceleration = Math.abs(xForce / object.mass),// * (object.x < this.x ? -1 : 1),
								yAcceleration = Math.abs(yForce / object.mass);// * (object.y < this.y ? -1 : 1);
		
								opts.objects[i].force = force;
		
								if(object.x < otherObject.x)
									opts.objects[i].velocityX += xAcceleration*dt;
								else
									opts.objects[i].velocityX -= xAcceleration*dt;
				
								if(object.y < otherObject.y)
									opts.objects[i].velocityY += yAcceleration*dt;
								else
									opts.objects[i].velocityY -= yAcceleration*dt;
			
								// if there is a collision reverse FORCE.
								// http://www.physicsclassroom.com/Class/momentum/U4L2a.cfm
		
						}
					}
					
					// move objects a little bit
					opts.objects[i].x += (object.velocityX) * dt;
					opts.objects[i].y += (object.velocityY) * dt;
				}		
				
			}
		
		};
	}

	/**
	*
	* Gather all the canvases with the data-ugravity-src attribute
	* and load the assigned jsonp datafile for each canvas.
	*
	**/
	if(typeof document != "undefined") {
		var elements = document.querySelectorAll("canvas[data-ugravity-src]");
	
		for(var i in elements) {
			(function(element) {
				if(element.getAttribute) {
					// Get the path of the data file
					var src = element.getAttribute("data-ugravity-src");
		
					// Load our jsonp datafile by appending a script tag to the head.
					var se = document.createElement('script');
					se.setAttribute('type', 'text/javascript');
					se.setAttribute('src', src);
			
					se.onload = function () {
						// Throw an error if the datafile did not load correctly.
						if(!jsonp_opts || typeof jsonp_opts != "object") {
							throw "Error loading uGravity datafile: " + src;
						} else {
							new uGravity(element, jsonp_opts);
						}
					
						// Make certain this temporary variable is reset between uGravity script loads
						jsonp_opts = null;
					}
					document.getElementsByTagName('head').item(0).appendChild(se);
				}
			})(elements[i]);
		}
	}
	
	return uGravity;

});