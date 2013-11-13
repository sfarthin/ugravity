(function() {
	// Variable to catch data from jsonp datafiles until the onload method triggers and we
	// assign these options to the appropriate canvas.
	var jsonp_opts;
	
	/**
	*
	* Main class managing all the parts neccessary to run the simulation.
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
		var self = this;
		this.canvas = canvas;
	    this.context2D = canvas.getContext('2d');

		// A reference to the in-memory canvas used as a back buffer 
        this.backBuffer = document.createElement('canvas');
        this.backBuffer.width = this.canvas.width;
        this.backBuffer.height = this.canvas.height;
        this.backBufferContext2D = this.backBuffer.getContext('2d');

		// Creation of our inline worker to do our physics
		var blob = new Blob(["("+PhysicsWorker.toString()+")()"]),
			blobURL = window.URL.createObjectURL(blob);
		
		this.worker = new Worker(blobURL);
		
		
		
		this.offsetX = 0;
		this.offsetY = 0;
		this.scale = 80;
		this.mousedown = false;
		 		
		// 	    canvas.addEventListener("dragstart", function( event ) {
		var last_position_x,
			last_position_y;
				
		canvas.addEventListener ("mousedown", function (event) {
			self.mousedown = true;
			canvas.style.cursor = 'grabbing';
		});
		
		canvas.addEventListener ("mouseup", function (event) {
			self.mousedown = false;
			last_position_x = null;
			last_position_y = null;
			canvas.style.cursor = 'default';
		});
		
		canvas.addEventListener('mousewheel', function(e) {
			var wheelData = e.detail ? e.detail * -1 : e.wheelDelta / 10;
			
			// need to scale into the position of the cursor;
			self.scale += wheelData;
			if(self.scale < 1)
				self.scale = 1;
				
			// self.offsetX += wheelData;
			// self.offsetY += wheelData;
				

			e.stopPropagation();
			e.preventDefault();
			return false;
		}, false);  
				
		canvas.addEventListener ("mousemove", function (event) {
			if(self.mousedown) {
	            var x = event.clientX;
	            var y = event.clientY;
			
				if(last_position_x && last_position_y) {
					self.offsetX += (x - last_position_x)/self.scale;
					self.offsetY += (y - last_position_y)/self.scale;
				}
			
				last_position_x = x;
				last_position_y = y;
			}
			
        });
	     // }, false);
			// 		 
			//  	    canvas.addEventListener("dragend", function( event ) {
			// canvas.removeEventListener("mousemove");
			//  	     }, false);
		

	    /**
		*
		* Starts up the simulation
		*
		**/
	    this.start = function() {
			this.worker.onmessage = this.onmessage;
			this.worker.postMessage({
				cmd: "start",
				opts: opts
			});
			      
	    }
		
		/**
		*
		* Handles messages from our worker
		*
		**/
		this.onmessage = function(msg) {
			
			var data = msg.data,
				cmd  = data.cmd;
				
			document.getElementById("debug").innerHTML = "cmd: " + data.cmd +
														 "<br>timestamp: " + new Date() +
														 "<br>frames: " + data.numFrames;
			
			switch(cmd) {
				case "render": self.render(data.settings, data.objects); return
				
			}
			//); // Start the worker.
	
			// worker.postMessage(this.objects.map(function(g) {
			// 	g.update = g.update.toString();
			// 	return g;
			// }));
			
		}

		/**
		*
		* Render our scene
		*
		**/
	    this.render = function (settings, objects) {
    
	        // Clear our drawing contexts
	        this.backBufferContext2D.clearRect(0, 0, this.backBuffer.width, this.backBuffer.height);
	        this.context2D.clearRect(0, 0, this.canvas.width, this.canvas.height);

	        // Draw our objects onto the back buffer
	        for (x in objects) {
	            this.drawObject(this.backBufferContext2D, objects[x], settings);
	        }
    
	        // copy the back buffer to the displayed canvas
	        this.context2D.drawImage(this.backBuffer, 0, 0);
	    };

		/**
		*
		* Render an individual object
		*
		**/
		this.drawObject = function(/**CanvasRenderingContext2D*/ ctx, /*Object*/object, settings) {

			object.scaledX 		= (this.scale * (object.x + this.offsetX)) + this.canvas.width/2;
			object.scaledY 		= (this.scale * (object.y + this.offsetY)) + this.canvas.height/2;
			object.scaledRadius = this.scale * object.radius * 20;
	
			ctx.save();

			ctx.beginPath();

			ctx.arc(object.scaledX,object.scaledY,object.scaledRadius,0,Math.PI*2,true);
			ctx.clip();

			ctx.fillStyle = object.color;
			ctx.fill();

			// restore to a time without the clipping path.
			ctx.restore();
		}
		
		
		this.start();
	}
	
	function PhysicsWorker() {
		// NOTE: Assume nothing about the host environment or scope because this is thrown in an inline web worker

		/**
		*
		* Configuration variables
		*
		**/		
		var SETTINGS = {
				FPS: 30,
				TIME_SCALE: 1
				// SECONDS_BETWEEN_FRAMES is computed
			},
			OBJECTS = [],
			frame_rate_interval,
			state,
			numFrames = 0;
		
		/**
		*
		* Utility and Helper functions
		*
		**/
		
	    // Extend a given object with all the properties in passed-in object(s).
		// http://underscorejs.org/underscore.js
		var extend = function(obj) {
				slice.call(arguments, 1).forEach(function(source) {
					if (source) {
						for (var prop in source) {
							obj[prop] = source[prop];
						}
					}
				});
				return obj;
			},
			
			// Distance formula
			getDistance = function(a,b) {
				return Math.pow(Math.pow(b[1]-a[1], 2) + Math.pow(b[0]-a[0], 2), 0.5);
			},
			
			// reloads options if a setting or object has changed.
			loadOpts = function(opts) {
				if(opts.settings) SETTINGS = extend({},VIEW,opts.settings);
				
				SETTINGS.SECONDS_BETWEEN_FRAMES = 1 / SETTINGS.FPS;
				OBJECTS = opts.objects;
			},
			
			// posts a message up to render
			render = function() {
				
				postMessage({
					cmd: 		"render",
					settings: 	SETTINGS,
					objects: 	OBJECTS,
					numFrames: numFrames * (1/SETTINGS.SECONDS_BETWEEN_FRAMES)
				});
				
			},
			start = function() {
				
				// Lets set our initial state to go, this may change.
				state = "go";
				
				var lastFrame 	= new Date().getTime(),
					lastRender	= new Date().getTime();
				while(state == "go") {
					
					numFrames++;
					
			        // calculate the time since the last frame
			        var thisFrame = new Date().getTime();
			        var dt = (thisFrame - lastFrame)/1000 * SETTINGS.TIME_SCALE;
			        lastFrame = thisFrame;
					
					if(SETTINGS.SECONDS_BETWEEN_FRAMES < (thisFrame - lastRender)/1000) {
						render();
						numFrames = 0;
						lastRender = thisFrame;
					}

					// Lets apply Universal Gravity from each object to every other object.
					for(var i in OBJECTS) {
						var object = OBJECTS[i];
						
						for(var j in OBJECTS) {
							var otherObject = OBJECTS[j];
						
							if(otherObject.mass && otherObject.name != object.name) {
			
								// Using our favorite F = G (m1*m2)/r^2
								// r = distance between the centers of the masses
								// G = 6.67 × 10^-8 gm^-1 cm^3 sec^-2
								var G 				= 6.67*Math.pow(10, -32),
					
									// distance formula
									slope 			= (otherObject.y - object.y)/(otherObject.x - object.x),
									angle 			= Math.atan(slope),
									distance 		= getDistance([otherObject.x, otherObject.y], [object.x, object.y]), 	// AU
									force  			= G * (object.mass * otherObject.mass) / Math.pow(distance, 2), 	// kg/s^2
			
									// http://zonalandeducation.com/mstm/physics/mechanics/forces/forceComponents/forceComponents.html
									xForce = force * Math.cos(angle),
									yForce = force * Math.sin(angle),
			
									//a = f/m1 because F = m*a
									xAcceleration = Math.abs(xForce / object.mass),// * (object.x < this.x ? -1 : 1),
									yAcceleration = Math.abs(yForce / object.mass);// * (object.y < this.y ? -1 : 1);
				
									OBJECTS[i].force = force;
				
									if(object.x < otherObject.x)
										OBJECTS[i].velocityX += xAcceleration*dt;
									else
										OBJECTS[i].velocityX -= xAcceleration*dt;
						
									if(object.y < otherObject.y)
										OBJECTS[i].velocityY += yAcceleration*dt;
									else
										OBJECTS[i].velocityY -= yAcceleration*dt;
					
									// if there is a collision reverse FORCE.
									// http://www.physicsclassroom.com/Class/momentum/U4L2a.cfm
				
							}
						}

						OBJECTS[i].x += object.velocityX * dt; // m/s * s
						OBJECTS[i].y += object.velocityY * dt;
					}
				}
				
				
			};
		
		
		
		/**
		*
		* Worker Message handler
		*
		*/
		onmessage = function(msg) {
			var cmd = msg.data.cmd;
			
			if(cmd == "start") {
				postMessage(msg.data);
				loadOpts(msg.data.opts);
				start();
			}
		}
		
	}
	
	// Expose this class to the outside world.
	window.uGravity = uGravity;

	/**
	*
	* Gather all the canvases with the data-ugravity-src attribute
	* and load the assigned jsonp datafile for each canvas.
	*
	**/
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

})();