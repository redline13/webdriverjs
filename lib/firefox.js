
var driver = null;

module.exports = {
	
	driver: function(){ return driver; },
	/**
	 * Load the driver and return the required components.
	 * @param user which user name/number we are creating for.
	 * @return Promise when driver loaded and initialized.
	 */
	load: function( user, webdriver, domains, hardFilter ){
		require('geckodriver');
		driver = new webdriver.Builder()
			.forBrowser('firefox')
			.build();
		return Promise.resolve();
	},

	/**
	 * Hopefully when closing and before losing access to browser we can get to the logs.
	 * @return Promise when done.
	 */
	close: function(user, api){
		return Promise.resolve();
	}
}
