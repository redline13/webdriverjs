
var driver = null;

module.exports = {
	
	driver: function(){
		return driver;
	},
	/**
	 * Load the driver and return the required components.
	 * @param user which user name/number we are creating for.
	 * @return Promise when driver loaded and initialized.
	 */
	load: function( user, webdriver, domains, hardFilter ){

		// Set path in capabilities
		var phantomjs_exe = require('phantomjs-prebuilt').path;
		var customPhantom = webdriver.Capabilities.phantomjs();
		customPhantom.set("phantomjs.binary.path", phantomjs_exe);
		customPhantom.set("phantomjs.page.settings.resourceTimeout", 30000);

		// Build Driver
		driver = new webdriver.Builder()
			.withCapabilities(customPhantom)
			.forBrowser('phantomjs')
			.build();

		// Insert redline into phantom
		driver.manage().window().maximize();
		var threadPromise = driver.executePhantomJS(
			" threadNumber = " + user + ";"  +
			" hardFilter = " + hardFilter + ";" +
			" domains = '" + domains + "'.trim().split( /[ ]+/ );"
		);
		var listenPromise = driver.executePhantomJS(
			function(){
				var page = this;
				var fs = require('fs');
				var path = "output/runLoadTest.jtl";
				var errorLog = "output/runLoadTest.log";

				page.redlines = [];
				page.onResourceRequested = function( req ){
					if ( !req.url.match(/(^data:image\/.*)/i) ){
						page.redlines[req.id] = { request: req }
					}
				}
				page.onResourceTimeout = function( req ){
					fs.write( 'output/onResourceTimeout.log', JSON.stringify(req), 'a+' );
				}
				page.onError = function( msg, trace ){
					var msgStack = ['ERROR: ' + msg];
				  if (trace && trace.length) {
				    msgStack.push('TRACE:');
				    trace.forEach(function(t) {
				      msgStack.push(' -> ' + t.file + ': ' + t.line + (t.function ? ' (in function "' + t.function +'")' : ''));
				    });
				  }
					fs.write( 'output/onError.log', msgStack.join('\n') + '\n', 'a+' );
				}
				page.onConsoleMessage = function(msg, lineNum, sourceId) {
					var line = '' + msg + ' (from line #' + lineNum + ' in "' + sourceId + '")\n';
					fs.write( 'output/onConsoleMessage.log', line, 'a+' );
				}
				page.onResourceReceived = function ( res ){
					if ( !page.redlines[res.id] )
						return;
					if ( res.stage === 'start' )
						page.redlines[res.id].startReply = res;
					else if ( res.stage === 'end' ){
						try{
							if ( !page.redlines[res.id].startReply ){
								page.redlines[res.id].startReply = {
									time : page.redlines[res.id].request.time,
									bodySize : 0
								};
							}
							page.redlines[res.id].endReply = res;
							var url = page.redlines[res.id].request.url.replace(/,/g,' ');
							var baseUrl = url.split(/[?#]/)[0];
							var label = null;
							if ( domains && domains.length > 0 ){
								domains.forEach( function( val, index ){
									if ( baseUrl.match( val ) )
										label = baseUrl;
								});
								if ( label == null ){
									if ( hardFilter === true )
										return;
									label = baseUrl.split( /^(?:.*:\/\/)?(?:[^@\n]+@)?(?:www\.)?([^:\/\n]+)/im )[1];
								}
							}
							var jtl = [];
							jtl.push( new Date().getTime() );
							jtl.push( page.redlines[res.id].endReply.time - page.redlines[res.id].request.time );
							jtl.push( label || baseUrl );
							jtl.push( page.redlines[res.id].endReply.status );
							jtl.push( page.redlines[res.id].endReply.statusText );
							jtl.push( "Thread Group 1-" + (threadNumber || 1) );
							jtl.push( page.redlines[res.id].endReply.contentType );
							jtl.push( page.redlines[res.id].endReply.status >= 400 ? "false" : "true" );
							jtl.push( "" );
							jtl.push( page.redlines[res.id].startReply.bodySize || 0 );
							jtl.push( "1" );
							jtl.push( "1" );
							jtl.push( url );
							jtl.push( page.redlines[res.id].startReply.time - page.redlines[res.id].request.time );
							fs.write( path, jtl.join(',') + "\n", 'a+' );
							delete jtl;
						}catch(e){
							fs.write( errorLog, "" + e + (e.stack ? "\n" + e.stack : "") + "\n", 'a+' );
						}
					}
				}
			}
		);

		return Promise.all([threadPromise,listenPromise]);
	},
	close: function(){
		return Promise.resolve();
	}
}
