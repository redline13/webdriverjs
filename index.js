var webdriver = require('selenium-webdriver');
var fs = require('fs');

// Initialize Object to fill.
RedLineWebDriver = function(){};

/**
 * Your webdriver test should invoke this to access the browser/driver.
 * Also for dev creates ./output for snapshots and log/jtl files.
 * @return Driver instance
 */
RedLineWebDriver.loadBrowser = function( browser, domains, hardFilter ){
	if (!fs.existsSync('./output')){
		fs.mkdirSync('./output');
	}

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

	// Take action on browser type
	switch( browserName ) {

		case 'phantomjs':
		case 'firefox':
		case 'chrome':
			var browser = require( './lib/' + browserName );
			returnPromise = browser.load(RedLineWebDriver.user, webdriver, domains, hardFilter);
			RedLineWebDriver.driver = browser.driver();
			RedLineWebDriver.driver.manage().timeouts().implicitlyWait(30000);
			RedLineWebDriver.driver.manage().timeouts().setScriptTimeout(60000);
			RedLineWebDriver.driver.manage().timeouts().pageLoadTimeout(120000);

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
