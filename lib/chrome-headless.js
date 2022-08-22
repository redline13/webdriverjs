var driver = null;
var domains = null;
var hardFilter = false;

module.exports = {

	driver: function(){
		return driver;
	},
	/**
	 * Load the driver and return the required components.
	 * @param user which user name/number we are creating for.
	 * @return Promise when driver loaded and initialized.
	 */
	load: function( user, webdriver, _domains, _hardFilter ){
		domains = _domains.trim().split( /[ ]+/ );
		hardFilter = _hardFilter;

		require('chromedriver');
		const chrome = require('selenium-webdriver/chrome');

		var builder = new webdriver.Builder();
		builder.setChromeOptions( new chrome.Options()
			.headless()
			.addArguments("--disable-dev-shm-usage")
			.addArguments("--no-sandbox")
			.setLoggingPrefs( {'performance':'ALL'} )
			.setPerfLoggingPrefs(
				{
					enableNetwork: true,
					enablePage: true
				}
			)
		)
		builder.forBrowser('chrome')
		driver = builder.build();
		return Promise.resolve();
	},

	/**
	 * Hopefully when closing and before losing access to browser we can get to the logs.
	 * @return Promise when done.
	 */
	close: function(user, api){
		var logs = driver.manage().logs();
		return logs.get('performance').then( function(log){
			// Build a JMeter Perf log in string buffer.
			var buf = "";

			// Iterate and track requests within performance log
			var req = {};
			for( line in log ){
				var msg = null;
				try{
					msg = JSON.parse(log[line].message);
					switch( msg.message.method ){
						case 'Network.requestWillBeSent':
							// Ignore protocol data:
							if (msg.message.params.request.url.startsWith('data') )
								break;

							// Strip , since we are putting in CSV
							var originalUrl = msg.message.params.request.url.replace(/,/g,' ');

							// Strip Query String for a name.
							var url = originalUrl.split(/[?#]/)[0];

							// Filter if domains are provided
							if ( domains && domains.length > 0 ){
								var label = null;
								domains.forEach( function( val, index ){
									if ( url.match( val ) )
										label = url;
								});
								if ( label == null ){
									if ( hardFilter === true )
										break;
									url = url.split( /^(?:.*:\/\/)?(?:[^@\n]+@)?(?:www\.)?([^:\/\n]+)/im )[1];
								}
							}

							req[msg.message.params.requestId] = {
								wallTime : Math.floor(msg.message.params.wallTime),
								start: msg.message.params.timestamp,
								url: url,
								originalUrl: originalUrl,
								bytes: 0,
								status: 0,
								statusText: null,
								contentType: "",
								latency: 0
							};
							break;
						case 'Network.responseReceived':
							if ( req[msg.message.params.requestId] ){
								req[msg.message.params.requestId].status = msg.message.params.response.status;
								req[msg.message.params.requestId].statusText = msg.message.params.response.statusText;
								req[msg.message.params.requestId].contentType = msg.message.params.response.mimeType || "";
								req[msg.message.params.requestId].latency = msg.message.params.response.timing.sendEnd || 0;
							}
							break;
						case 'Network.dataReceived':
							break;
						case 'Network.loadingFinished':
							if ( req[msg.message.params.requestId] ){
								// Record in redline
								var elapsed = msg.message.params.timestamp - req[msg.message.params.requestId].start;
								api.recordURLPageLoad(
									req[msg.message.params.requestId].url,
									req[msg.message.params.requestId].wallTime,
									elapsed,
									req[msg.message.params.requestId].status >= 400,
									req[msg.message.params.requestId].bytes || 0,
									req[msg.message.params.requestId].status || 0,
									user
								);

								// Build JMeter JTL Lines.
								var jtl = [];
								jtl.push( req[msg.message.params.requestId].wallTime );
								jtl.push( Math.floor(elapsed*1000) );
								jtl.push( req[msg.message.params.requestId].url );
								jtl.push( req[msg.message.params.requestId].status );
								jtl.push( req[msg.message.params.requestId].statusText );
								jtl.push( "Thread Group 1-" + user );
								jtl.push( req[msg.message.params.requestId].contentType );
								jtl.push( req[msg.message.params.requestId].status >= 400 ? "false" : "true" );
								jtl.push( "" );
								jtl.push( req[msg.message.params.requestId].bytes || 0 );
								jtl.push( "1" );
								jtl.push( "1" );
								jtl.push( req[msg.message.params.requestId].originalUrl );
								jtl.push( Math.round(req[msg.message.params.requestId].latency) );
								buf += jtl.join(',') + "\n";
								delete req[msg.message.params.requestId];
							}
							break;
					}

				} catch( e ){ console.log( "Error processing error log line.",e,JSON.stringify(msg) ); continue; }
				msg = null;
			}
			if ( buf.length > 0 ){
				api.writeJTL(buf);
			}
		},
		function(e){
			console.log( "FAILED: To access the performance log!", e);
		});
	}
}
