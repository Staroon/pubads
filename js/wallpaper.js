
function wallpaper( opts, onInit, onRender, onResize, onApplyGeneralProperties, onApplyUserProperties, onAudioData )
{
	this.log = typeof log !== 'undefined' ? log : null;
	this.timer = typeof timer !== 'undefined' ? timer : null;
	
	this.canvas = null;
	this.context = null;
	this.fpsLabel = null;
	
	this.noAudioDelay = null;
	
	this.settings = {
		hideFps: true,
		hideTimer: true,
		hideLog: true,
		targetFrameRate: 60, /* frames per second */
		estimateFrameRenderDuration: 2, /* in milliseconds */
		canvasScaling: 1
	};

	this.cpuWarning = null;
	this.generalSettings = {};
	this.userSettings = {};
	this.audioData = [];
	
	if( typeof opts === 'object' ) {
		for( var i in opts )
		{
			if( opts.hasOwnProperty(i) && this.settings.hasOwnProperty(i) ) {
				this.settings[i] = opts[i];
			}
		}
	}

	this.frameIntervalCheck = 1000/this.settings.targetFrameRate;// - this.settings.estimateFrameRenderDuration;

	this.onInit = onInit;
	this.onRender = onRender;
	this.onResize = onResize;
	this.onApplyGeneralProperties = onApplyGeneralProperties;
	this.onApplyUserProperties = onApplyUserProperties;
	this.onAudioData = onAudioData;
	
	this.init();
}

wallpaper.prototype = {
	init: function()
	{
		var self = this;
		
		this.createFpsLabel();
		
		if( this.settings.hideFps && this.fpsLabel ) {
			this.hideFps();
		}
		if( this.settings.hideTimer && this.timer ) {
			this.hideTimer();
		}
		if( this.settings.hideLog && this.log ) {
			this.hideLog();
		}

		this.disableCpuWarning = false;
		this.cpuWarning = document.getElementById('cpu-warning');
		this.hideCpuWarning();
		this.canvas = document.getElementById('canvas');
		this.canvas.style.transformOrigin = '0 0';
		if( this.settings.canvasScaling != 1 ) {
			this.canvas.style.transform = 'scale(' + (this.settings.canvasScaling+0.01) +' )'; //adding a bit in case of rounding errors that cause white lines on edge
		}
		
		this.context = this.canvas.getContext('2d', {alpha: false} );
		//this.context.translate(0.5, 0.5);

		this.ticks = 0;
		this.timeSpent = 0;
		this.timeSpentPrev = 0;
		this.lastFrame = performance.now();
		this.nextFrame = performance.now();
		this.fpsTimer = performance.now();
		
		this.renderTimeLastTime = 0;
		this.renderTimeLastTimeMin = 0;
		this.renderTimeLastTimeMax = 0;
		
		this.refreshAll();
		
		if( this.onInit ) {
			try {
				this.onInit( this );
			}
			catch( ex ) {
				console.error( ex.message );
				return;
			}
		}
		
		//this.noAudioDelay = new delayed( function() {
		//	console.error( 'Not receiving audio from Wallpaper Engine' );
		//}, 10000 );

		var self = this;
		window.addEventListener('resize', function () { self.onWindowResize(); } );
		window.wallpaperPropertyListener = {
			applyUserProperties: function( properties ) {self.applyUserProperties( properties );},
			applyGeneralProperties: function( properties ) {self.applyGeneralProperties( properties );}
		};
		
	   // this.registerAudioListener();
		window.requestAnimationFrame( function(timestamp) { self.animationLoop(timestamp); } );
	},
	registerAudioListener: function()
	{
		return;
		var self = this;
		if( window.wallpaperRegisterAudioListener ) {
			//console.log( 'registerAudioListener' );
			window.wallpaperRegisterAudioListener(function(data) { self.noAudioDelay.trigger(); self.onAudioDataReceived( data ); });
			this.noAudioDelay.trigger(); 
		}
		else {
			console.error( 'can\'t register audio listener' );
		}
	},
	createFpsLabel: function() 
	{
		var self = this;
		this.fpsLabel = document.createElement( 'div' );
	
		this.fpsLabel.style.position = 'fixed';
		this.fpsLabel.style.top = 0;
		this.fpsLabel.style.left= 0;
		this.fpsLabel.style.background = 'rgba( 0, 0, 0, 196 )';
		this.fpsLabel.style.color = 'white';
		this.fpsLabel.style.zIndex = '1000';
		this.fpsLabel.style.visibility = 'visible';
		
		var bodyCheckTimeout = function()
		{
			if( document.body && document.body.appendChild ) {
				document.body.appendChild( self.fpsLabel );
			}
			else {
				setTimeout( function(){ bodyCheckTimeout(); }, 100 );
			}
		};
		setTimeout( function(){ bodyCheckTimeout(); }, 100 );
		
	},
	setTargetFramerate: function( fps )
	{
		this.settings.targetFrameRate = fps;
		this.frameIntervalCheck = 1000/this.settings.targetFrameRate;
	},
	setPaused: function( isPaused )
	{
		this.isPaused = isPaused;
		if( isPaused )
		{
			// clear render loop timeout
			//if( this.animationLoopTimeout ) {
			//	clearTimeout(this.animationLoopTimeout);
			//	this.animationLoopTimeout = null;
			//}
		}
		else
		{
			// start render loop timeout
			//if( !this.animationLoopTimeout ) {
			//	this.nextFrame = performance.now(); // set next frame to now, to avoid a burst of frame rendering
			//	this.animationLoop();
				//setTimeout( function() { self.animationLoop(); } ,this.nextFrame - now2 - 1  )
			//}
		}
	},
	onWindowResize: function()
	{
		this.refreshAll();
		if( this.onResize ) {
			try {
				this.onResize( this );
			}
			catch( ex ) {
				console.error( ex.message );
			}
		}

	},
	onAudioDataReceived: function( data )
	{
		for( var i = 0; i < data.length; i++ ) {
			if( isNaN(data[i]) || !isFinite( data[i]) ) {
				//if( this.log ) { 
				//	this.log.append( 'data['+i+']: ' + data[i] );
				//}
				data[i] = 0;
			}
		}
		this.audioData = data;
		if( this.onAudioData ) {
			try {
				this.onAudioData( this, data );
			}
			catch( ex ) {
				console.error( ex );
			}
		}
		this.hideLog();
	},
	applyGeneralProperties: function( properties )
	{
		for( var i in properties ) {
			if( properties.hasOwnProperty( i ) ) {
			//	this.generalSettings[i] = properties[i];
			}
		}
		if(  properties.fps ) {
			var val =  1*properties.fps;
			this.setTargetFramerate( val );
		}
		
		//this.registerAudioListener();
		
		if( this.onApplyGeneralProperties ) {
			try {
				this.onApplyGeneralProperties( this, properties );
			} 
			catch( ex ) {
				console.error( ex.message );
			}
		}

	},
	applyUserProperties: function( properties )
	{
		for( var i in properties ) {
			if( properties.hasOwnProperty( i ) ) {
				//this.userSettings[i] = properties[i];
			}
		}
		
		if( properties.disableCpuWarning ) {
			this.disableCpuWarning = properties.disableCpuWarning.value ? true : false;
			if( this.disableCpuWarning ) {
				this.hideCpuWarning();
			}
		}
		
		var self = this;		
		if( this.onApplyUserProperties ) { 
			try {
				this.onApplyUserProperties( this, properties );
			}
			catch( ex ) {
				console.error( ex.message );
			}
		}

	},
	refreshAll: function()
	{
		this.width = this.canvas.width = window.innerWidth/this.settings.canvasScaling;
		this.height = this.canvas.height = window.innerHeight/this.settings.canvasScaling;
	},
	animationLoop: function( timestamp )
	{ 
		var self = this;
		
		var now = performance.now();
//
		window.requestAnimationFrame( function() { self.animationLoop(); } );
		if( now < this.nextFrame ) { // skip frame until timeStep ( in milliseconds ) has passed
			//setTimeout( function() { self.animationLoop(); } , this.nextFrame - now - 1 );
			return;
		}
		
		
		if( this.timer ) this.timer.start("wallpaper::animationLoop");
		var timeStep = now - this.lastFrame; 
		this.nextFrame += this.frameIntervalCheck;
		if( this.nextFrame < now - this.frameIntervalCheck * 1 ) {
			 // avoid next frame falling behind due to slow rendering and causing a burst of frames to be rendered
			this.nextFrame = now + this.frameIntervalCheck;
		}
		this.lastFrame = now;
		this.ticks++;

		if( this.timer ) this.timer.start("wallpaper::onRender");
		if( this.onRender ) {
			try {
				this.onRender( this, timeStep, this.ticks );
			}
			catch( ex ) {
				console.error( ex.stack.replace( /^\s+/g, '' ).replace( /(http|file).+\//g, '' ) );
			}
		}
		if( this.timer ) this.timer.stop("wallpaper::onRender");

		//this.rendering = false;
		var now2 = performance.now();
		this.renderTimeLastTime = now2-now; // time it took to render		
		this.timeSpent += this.renderTimeLastTime;
		if( this.renderTimeLastTimeMin > this.renderTimeLastTime ) this.renderTimeLastTimeMin = this.renderTimeLastTime;
		if( this.renderTimeLastTimeMax < this.renderTimeLastTime ) this.renderTimeLastTimeMax = this.renderTimeLastTime;
		
		this.updateFps();

	},
	updateFps: function()
	{
		if( !this.fpsLabel ) return;
		
		var now = performance.now();
		this.frames++;
		if( now - this.fpsTimer > 1000 ) {		
			var frames = this.frames  * 1000 / ( now - this.fpsTimer );
			if( this.fpsLabel.style.display != 'none' ) {
				this.fpsLabel.innerHTML = frames + ' fps / ' + this.timeSpent.toFixed(3) + ' ms last frame / ' + this.ticks + ' ticks';
			}
			
			if( !this.disableCpuWarning ) {
				if( this.timeSpentPrev > 300 && this.timeSpent > 300 ) {
					this.showCpuWarning();
				}
				else if( this.timeSpentPrev <= 300 && this.timeSpent <= 300 ) {
					this.hideCpuWarning();
				}
			}
			
			this.fpsTimer = now;
			this.frames = 0;
			this.timeSpentPrev = this.timeSpent;
			this.timeSpent = 0;
			this.renderTimeLastTimeMin = 100000000000000;
			this.renderTimeLastTimeMax = 0;
		}
	},
	showCpuWarning: function() { this.cpuWarning.style.display = 'block'; },
	hideCpuWarning: function() { this.cpuWarning.style.display = 'none'; },
	showFps: function() { this.fpsLabel.style.display = 'block'; },
	hideFps: function() { this.fpsLabel.style.display = 'none'; },
	showLog: function() { this.log.htmlElement.style.display = 'block'; },
	hideLog: function() { this.log.htmlElement.style.display = 'none'; },
	showTimer: function() { this.timer.htmlElement.style.display = 'block'; },
	hideTimer: function() { this.timer.htmlElement.style.display = 'none'; }
};

// fake audio data if needed
if( false && !window.wallpaperRegisterAudioListener ) {
	var _wallpaperAudioInterval = null;
    window.wallpaperRegisterAudioListener = function( callback ) {
		if( callback !== null ) {
			if( _wallpaperAudioInterval ) {
				clearInterval( _wallpaperAudioInterval );
				_wallpaperAudioInterval = null;
			}
			var cnt = 0;
			_wallpaperAudioInterval = setInterval( function() {
				cnt++;
				var data = [];
				for( var i = 0; i < 64; i++ ){
					var v = 1 + (Math.sin( ( i * 14 + cnt*120 )* Math.PI / 180 )  + Math.sin( ( i * 17 + cnt*90 )* Math.PI / 180 ))/2 ; // limit range but still allow it to go above 1 to test clamping
					data[i] = v;
					data[i+64]= v;
				}
				callback( data );
			}, 33 );
		}
	};
}

function loadJSON(path, success, error)
{
    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function()
    {
        if (xhr.readyState === XMLHttpRequest.DONE) {
            if (xhr.status === 200) {
                if (success)
                    success(JSON.parse(xhr.responseText));
            } else {
                if (error)
                    error(xhr);
            }
        }
    };
    xhr.open("GET", path, true);
    xhr.send();
}

function loadProjectJson()
{
						//window.wallpaperPropertyListener.applyUserProperties( data.general.properties );
						//return;
	loadJSON( './project.json', 
				function( data )
				{ 
					if( window.wallpaperPropertyListener && window.wallpaperPropertyListener.applyUserProperties )
					{
						window.wallpaperPropertyListener.applyUserProperties( data.general.properties );
					}
				},
				function(xhr){
					console.error( xhr );
				});
		
}

// load project settings
//loadProjectJson();



		

