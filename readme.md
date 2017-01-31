# RedLine13 Peformance Testing with WebDriver

Runs WebDriver test to collect performance data and exports Apache JMeter data (as a .jtl)
- PhantomJS - supports exporting performance data in realtime
- Chrome - supports exporting performance data at end of test
- Firefox - supports running test performance data is not currently supported.
- IE - not supported
- Safari - not supported

### installing
npm install redline13-webdriver

### integrating with your tests
In your webdriver test file 
```
  // include redline
  var redline = require( 'redline13-webdriver' );

  // load your driver via redline13
  // redline13 library uses standard mechanism but presets some capabilities
  var browser = redline.loadBrowser('chrome');

  // You can require webdriver yourself or use redline13.webdriver
  var By = redline.webdriver.By;
  var until = redline.webdriver.until;

  browser.get( "http://example.com" );
```

### Running at Scale on RedLine13
Checkout out [redline13.com](redline13.com) and you can easily run this as 5 users or 5000 users.   We have example of running a 5000 user selenium-webdriver performance test for $10.

### redline13 methods
__redline.loadBrowser( string browser, string domains, boolean hardFilter )__

loads [selenium driver class](http://seleniumhq.github.io/selenium/docs/api/javascript/module/selenium-webdriver/index_exports_WebDriver.html) while wrapping to capture performance data
```
  @param browser phantomjs | chrome | firefox
  @param domains string space separated list of domains(regex) filters for inclusion in performance data
  @param hardFilter boolean true will cause anything not filtered to be ignored, false anything not filtered will be recorded only by domain name.

  @return Driver instance
```

__redline.snap ( string filename )__

Captures a screenshot and tracks completion.  During a test on redline13.com if you capture a screenshot and store it to output/filename.png it will make that screenshot available after test completion. This functions calls the normal takeScreenshot but forces storing filename in output/filename.

### redline13 properties
__api__
provides access to the redline13 api for recording extra performance or error data.  

Locally it provides two methods
  * api.recordError( string|object error ) 
  * api.record(string label, date timestamp, int elapsed time, boolean err, int kb)

__driver__
the driver loaded for the selected browser type
webdriver - the original resource from require ('selenium-webdriver')

__user__
name or id of user running test, will default to 0.  During redline13.com load tests this will be unique for each user simulated.

__config__
empty by default. During a redline13.com load test will provide data used to configure test definition.
