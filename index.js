var webdriver = require('selenium-webdriver');
var fs = require('fs');

/**
 * Used to setup the basics when running a load test.
 */
function RedLineWebDriver(redlineApi, testNum, rand, config){

	// Setup static available for webdriver script.
	RedLineWebDriver.api = redlineApi;
	RedLineWebDriver.user = testNum;
	RedLineWebDriver.config = config;

	// Redline API
	this.redlineApi = redlineApi;

	// Test info
	this.testNum = testNum;
	this.rand = rand;

	// INI Config
	this.config = config;
}

/**
 * Utilized by the RedLine13 Production Environment to launch test.
 * For local testing this function is not required.
 * 
 * @param callback method to invoke back into redline layer when test completes indicating if user was success/fail.
 */
RedLineWebDriver.prototype.runTest = function(callback)
{
	var that = this;
	var wd = that.config.customFile;
	console.log( "Load webdriver test: " + wd );

	// Async Invoke, parent waiting for callback invoke.
	setTimeout(function() {
		try
		{
			// Preload the webdriver and inject
			that._loadWebDriver( that.config.webdriver_node_browser || "" )
			.then( function(){

					// We can catch WebDriver script issues
					webdriver.promise.controlFlow().on('uncaughtException', function(e) {
						console.log( "WebDriver Uncaught Exception", e )
						that.redlineApi.recordError("WD Uncaught:"+e + (e.stack ? "\n" + e.stack : ""));
						callback.call(that, true);
					});

					// Require the testers file ( bridge from RL to WD )
					require( "./" + wd );

					// CloseWebDriver operation if user did not call quit();
					that.closeWebDriver();

				// We wait for promises to complete, currently snapshots.
				Promise.all( RedLineWebDriver.promises ).then(
					function(values){
						console.log( "Callback on tests running!" );
						callback.call(that, false);
					}
				).catch( function(err){
					console.log( "Catch - Promises ALL failing", err );
					callback.call(that, true);
				})

			}).catch( function(err){
				console.log( "Catch - Promise LoadTest Failing", err );
				that.closeWebDriver();
				that.redlineApi.recordError(""+err + (err.stack ? "\n" + err.stack : ""));
				callback.call(that, true);
			})

		} catch (e) {
			console.log( "Fallback Errror Trap", e )
			that.closeWebDriver();
			that.redlineApi.recordError(""+e + (e.stack ? "\n" + e.stack : ""));
			callback.call(that, true);
		}
	}, 1);
};

/**
 * Hard cleanup for webdriver.
 * It is possible users script called this, which is problem
 * to capturing detailed metrics data for Chrome/FF (TODO: Use Extensions/AddOns)
 */
RedLineWebDriver.closeWebDriver = function( ){
	try{
		if ( RedLineWebDriver.driver ) {
			console.log( "Add close webdriver (quit) to end of sequence!");
			RedLineWebDriver.driver.quit()
			.then(
				function(){
					console.log( "GOOD: WEBDRIVER QUIT!");
				})
			.catch(
				function(){
					console.log( "BAD: WEBDRIVER QUIT!");
				});
		}
	} catch (e) {
		// Safely ignore exceptions
	}
}

/**
 * Your webdriver test should invoke this to access the browser/driver.
 * Also for dev creates ./output for snapshots and log/jtl files.
 */
RedLineWebDriver.loadBrowser = function( browser ){
	if (!fs.existsSync('./output')){
		fs.mkdirSync('./output');
	}
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
RedLineWebDriver.fail = function(){
	RedLineWebDriver.snap( RedLineWebDriver.driver, "error-" + Date.now() + ".png" );
}

/**
 * Helper function to ignore, typically success request.
 */
RedLineWebDriver.ignore = function(){}

module.exports = RedLineWebDriver;

// var c = new RedLineWebDriver( { recordURLPageLoad: function(){} }, 1, 1, {} );
// c.runTest( function(){} );
