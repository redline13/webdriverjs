var webdriver = require('selenium-webdriver');
var fs = require('fs');

// Initialize Object to fill.
RedLineWebDriver = function(){};

/**
 * Your webdriver test should invoke this to access the browser/driver.
 * Also for dev creates ./output for snapshots and log/jtl files.
 *
 * @param browser  chrome | firefox | chrome-headless | firefox-headless
 * @param domains string space separated list of domains(regex) filters for inclusion in performance data
 * @param hardFilter boolean true will cause anything not filtered to be ignored, false anything not filtered will be recorded only by domain name.
 * @return Driver instance
 */
RedLineWebDriver.loadBrowser = function( browser, domains, hardFilter ){
	if (!fs.existsSync('./output')){
		fs.mkdirSync('./output');
	}
	var header = 'timeStamp,elapsed,label,responseCode,responseMessage,threadName,dataType,success,failureMessage,bytes,grpThreads,allThreads,URL,Latency\n';
	RedLineWebDriver.api.writeJTL( header );

	// Instantiate webdriver, but allow promises to run any extra steps.
	if ( !RedLineWebDriver.driver ){
		RedLineWebDriver._loadWebDriver(browser, domains || "" , hardFilter || false ).then(
			function(){},
			function(err){
				console.log( "Failed to create browser." , err );
			}
		);
	}


	return RedLineWebDriver.driver;
}

/**
 * Load WebDriver and inject RedLine13 so we can look at performance.
 * @return promise which resolved to driver.
 */
RedLineWebDriver._loadWebDriver = function( browserName, domains, hardFilter ){
	var returnPromise = null;
	var closeInvoked = false;
	var recordedMetrics = {};
	// Simple function to convert Performance metric to jmeter format.
	var record = function( start, metric ){
		metric.name = metric.name.replace( /,/g, '%2C');

		RedLineWebDriver.api.recordURLPageLoad(
			metric.name,
			Math.round((start + metric.startTime)/1000),
			Math.round(metric.duration/1000),
			false,
			metric.transferSize || 0,
			200,
			RedLineWebDriver.user
		);

		var jtl = [];
		jtl.push( Math.round(start + metric.startTime) );
		jtl.push( Math.round(metric.duration) );
		jtl.push( metric.name );
		jtl.push( 200 );
		jtl.push( "OK" );
		jtl.push( "Thread Group 1-" + RedLineWebDriver.user );
		jtl.push( metric.initiatorType || 'unknown' );
		jtl.push( true );
		jtl.push( "" );
		jtl.push( metric.transferSize || 0 );
		jtl.push( "1" );
		jtl.push( "1" );
		jtl.push( metric.entryType );
		jtl.push( Math.round(metric.responseStart - metric.requestStart) );
		return jtl;
	}

	// Take action on browser type
	switch( browserName ) {
		case 'phantomjs':
		case 'firefox':
		case 'firefox-headless':
		case 'chrome':
		case 'chrome-headless':
			var browser = require( './lib/' + browserName );
			returnPromise = browser.load(RedLineWebDriver.user, webdriver, domains, hardFilter);
			RedLineWebDriver.driver = browser.driver();
			RedLineWebDriver.driver.manage().timeouts().implicitlyWait(30000);
			RedLineWebDriver.driver.manage().timeouts().setScriptTimeout(60000);
			RedLineWebDriver.driver.manage().timeouts().pageLoadTimeout(120000);

			RedLineWebDriver.driver.recordMetrics = function ( label ){
				RedLineWebDriver.driver.executeScript(`
	if ( ! window.performance || !window.performance.timeOrigin ) return null;
	var data = {
		start : Math.round(window.performance.timeOrigin),
		navigation: window.performance.getEntriesByType('navigation'),
		resources: window.performance.getEntriesByType('resource')
	};
	window.performance.clearResourceTimings();
	return data;
`).then( function(metrics){
					if ( metrics == null ){
						console.log( "No Metrics");
					} else {
						_record = [];
						// Have we already recorded this label and start?
						if ( !recordedMetrics[metrics.start] && metrics.navigation.length > 0 ){
							recordedMetrics[metrics.start] = true;
							metrics.navigation[0].name = label;
							_record.push( record( metrics.start, metrics.navigation[0] ) );
						}
						// Did we capture resources
						if ( metrics.resources ){
							metrics.resources.forEach( function(metric){
								_record.push( record( metrics.start, metric ) );
							});
						}
						// Write to jmeter csv file
						if ( _record.length > 0 ){
							var buffer = _record.reduce( function( buf, val ){ return buf + val.join(',') + "\n";}, '' );
							RedLineWebDriver.api.writeJTL( buffer );
						}
						_record = null;
						return;
					}
				})
			}

			// Override Quit to call back into browser to do post test closing ops.
			RedLineWebDriver.driver._redlineQuit = RedLineWebDriver.driver.quit;
			RedLineWebDriver.driver.quit = function( failed ){
				if ( failed === true || closeInvoked === false ){
					browser.close( RedLineWebDriver.user, RedLineWebDriver.api );
					closeInvoked = RedLineWebDriver.driver._redlineQuit();
				}
				return closeInvoked;
			}
			break;

		default:
			console.log( "UNSUPPORTED BROWSER TYPE" );
			returnPromise = Promise.reject();
	}

	return returnPromise;
}

// Acccess to RedLineApi object for metrics.  A mock api is instantiated by constructor will replace for production.
RedLineWebDriver.api = {
	recordError: function(err){ console.log( "Recorded Error ", err ); },
	recordURLPageLoad: function(url, ts, time, err, kb, rc, user){
		console.log( "Record Load Time for ("+url+") in ("+time+")");
	},
	writeJTL: function( buf ){
		fs.appendFile( "output/runLoadTest.jtl", buf, function(err){
			if (err) console.log("Failed to write .jtl", err);
		});
	}
};

// The driver loaded for selected browser type.
RedLineWebDriver.driver = null;

// The selenium-webdriver base if a test class does not want to include
RedLineWebDriver.webdriver = webdriver;

// In selenium testing each users is single threaded, this will be constant.
RedLineWebDriver.user = 0;

// Access to configuration object
RedLineWebDriver.config = {};

// Hold on to the call back for RedLineWebDriver.callback
RedLineWebDriver.promises = [];

// Wrap taking a snapshot
RedLineWebDriver.snap = function( filename ){
	var p = new Promise( function( resolve, reject) {
		try{
			RedLineWebDriver.driver.takeScreenshot().then(function(data){
				var base64Data = data.replace(/^data:image\/png;base64,/,"")
				fs.writeFile( 'output/' + RedLineWebDriver.user + '_' + filename, base64Data, 'base64', function(err) {
					if(err){
						console.log( "Error creating SNAP for " + filename, err );
						resolve(err);
					} else {
						console.log( "SNAP: " + filename);
						resolve();
					}
				});
			},function(e){
				resolve(e);
			});
		} catch ( e ){
			console.log( "Exception creating SNAP for " + filename, e );
			// We don't reject as it is a best try
			resolve(e);
		}
	});
	RedLineWebDriver.promises.push( p );
	return p;
}

module.exports = RedLineWebDriver;
