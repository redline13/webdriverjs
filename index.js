var webdriver = require('selenium-webdriver');
var fs = require('fs');

// Initialize Object to fill.
RedLineWebDriver = function(){};

/**
 * Your webdriver test should invoke this to access the browser/driver.
 * Also for dev creates ./output for snapshots and log/jtl files.
 * @return Driver instance
 */
RedLineWebDriver.loadBrowser = function( browser ){
	if (!fs.existsSync('./output')){
		fs.mkdirSync('./output');
	}

	// Instantiate webdriver, but allow promises to run any extra steps.
	if ( !RedLineWebDriver.driver ){
		RedLineWebDriver._loadWebDriver(browser).then(
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
RedLineWebDriver._loadWebDriver = function( browserName ){
	var returnPromise = null;
	var closeInvoked = false;

	// Take action on browser type
	switch( browserName ) {

		case 'phantomjs':
		case 'firefox':
		case 'chrome':
			var browser = require( './lib/' + browserName );
			returnPromise = browser.load(RedLineWebDriver.user, webdriver);
			RedLineWebDriver.driver = browser.driver();

			// Override Quit to call back into browser to do post test closing ops.
			RedLineWebDriver.driver._redlineQuit = RedLineWebDriver.driver.quit;
			RedLineWebDriver.driver.quit = function(){
				if ( closeInvoked === false ){
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
	recordURLPageLoad: function(url, ts, time, err, kb){
		console.log( "Record Load Time for ("+url+") in ("+time+")"); 
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
RedLineWebDriver.snap = function( driver, filename ){
	var p = new Promise( function( resolve, reject) {
		try{
			driver.takeScreenshot().then(function(data){
				var base64Data = data.replace(/^data:image\/png;base64,/,"")
				fs.writeFile( 'output/' + RedLineWebDriver.user + '_' + filename, base64Data, 'base64', function(err) {
					if(err){
						console.log( "Error creating SNAP for " + filename, err );
						reject(err);
					} else {
						console.log( "SNAP: " + filename);
						resolve();
					}
				});
			});
		} catch ( e ){
			console.log( "Exception creating SNAP for " + filename, e );
			reject(e);
		}
	});
	RedLineWebDriver.promises.push( p );
}

/**
 * Helper to handle when test fails.
 * - Captures screenshot
 * - Maybe invokes quit?
 */
RedLineWebDriver.fail = function( err ){
	RedLineWebDriver.snap( RedLineWebDriver.driver, "error-" + Date.now() + ".png" );
	if ( err ){
		RedLineWebDriver.api.recordError( err.m)
		console.log( err );
	}
}

/**
 * Helper function to ignore, typically success request.
 */
RedLineWebDriver.ignore = function(){}

module.exports = RedLineWebDriver;
