/**
 * Willie - Configuration
 *
 * Utility functions to read configuration files
 */
// (C) Alexandre Morin 2015 - 2016

const fs = require('fs');
const extend = require('extend');
const Log = require('wg-log').Log;
const Exception = require('wg-log').Exception;

var log = Log.getLogger('willie::config');

/**
 * Default configuration
 */
var _defaultConfig = {
  // Application meta-data. Will be fetched dynamically from the package.json file
  version: undefined,

  // environment, can be dev, test or prod
  env: undefined,

  // Database connection string (ex: "postgres://<user>:<password>@<host>/<database>")
  // Should be set in config.json
  cnx: undefined,

  // Web server configuration
  web: {
    port: undefined
  },
  
  // Google maps API key
  // Should be set in config.json
  mapsAPIKey:  undefined,

  // Shutdown socket
  shutdown: {
    port:       7000,
    interface:  "localhost"
  },
}

/**
 * Load the general configuration file. Will actually merge it with the default configuration
 *
 * @param {string} fileName - is the name of the JSON configuration file to load
 * @param {function} callback - is the return function, returning an error and the JSON config file.
 */
load = function(fileName, callback) {
  var defaultConfig = extend(true, {}, _defaultConfig);
  // Read version from NPM package
  var packageJSON = JSON.parse(fs.readFileSync(__dirname + '/../package.json', 'utf8'));
  defaultConfig.version = packageJSON.version;
  return loadModuleConfig(fileName, defaultConfig, _check, callback);
}

/**
 * Check configuration
 */
_check = function(config, callback) {
  if (config.env!=='dev' && config.env!=='test' && config.env!=='prod') 
    return callback("Invalid configuration ('env')");
  if (!config.cnx)
      return callback("Invalid configuration (missing 'cnx')");
  if (!config.mapsAPIKey)
    return callback("Invalid configuration (missing 'mapsAPIKey')");
  return callback(undefined, config);
}

/**
 * Load a module configuration file.
 *
 * @param {string} fileName - the name of the configuration file to load
 * @param {JSON} defaultConfig - the default module condfiguration
 * @param {function} checkFn - the async check function, which will take the loaded config and return a validated config through a callback
 * @param {function} callback - is the return function, provided an error and a validated config
 */
loadModuleConfig = function(fileName, defaultConfig, checkFn, callback) {
  log.debug({fileName:fileName}, "Loading configuration file");
  var config = extend(true, {}, defaultConfig);
  
  return fs.readFile(fileName, 'utf8', function(err, data) {
    if (err) return callback(new Exception({fileName:fileName}, "Failed to load module configuration file", err));
    log.debug({data:data}, "Finished loading module configuration file");
    var configExtension = JSON.parse(data);
    config = extend(true, config, configExtension);
    return checkFn.call(config, config, function(err, config) {
      if (err) return callback(new Exception({fileName:fileName}, "Configuration fail checked", err));
      return callback(undefined, config);
    });
  });  
}


/**
 * Public interface
 */
module.exports = {
  load: load
};
