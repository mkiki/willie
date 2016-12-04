/**
 * Willie meida player - main entry point
 */
// (C) Alexandre Morin 2015 - 2016

const fs = require('fs');

const Log = require('wg-log').Log;
const Exception = require('wg-log').Exception;
const Database = require('wg-database').Database;
const Config = require('./config.js');

const configDir = __dirname + "/../config";
const configFile = configDir + "/config.json";

const log = Log.getLogger('willie::main');

// List of all modules
const moduleNames = ['core', 'photos', 'treeregister', 'miouzik'];
const modules = [];


Log.configure(configDir + "/loggers.json", function() {

  function start(callback) {

    log.info({configFile:configFile }, "Willie starting");

    /**
     * Load configuration
     */
     log.debug("Loading general configuration file");
    return Config.load(configFile, function(err, config) {
      if (err) return callback(err);
      log.debug({config:config, configFile:configFile}, "Loaded general configuration");

      /**
       * Initializes modules
       */
      log.debug({modules:moduleNames}, "Creating modules");
      for (var i=0; i<moduleNames.length; i++) {
        // Load module
        log.debug({module:moduleNames[i]}, "Creating module");
        var module = require("willie-" + moduleNames[i]);
        modules.push(module);
      }
      log.debug({modules:modules}, "Modules created");

      function startNextModule(remainingModules, callback) {
        if( remainingModules.length === 0) return callback();
        var module = remainingModules.shift();
        var moduleName = module.Module.moduleConfig.name;
        log.debug({remaining:remainingModules.length, module:moduleName}, "Starting next module");
        log.info({module:moduleName}, "Initializing module");
        // Load configuration file
        var moduleConfigFile = configDir + "/config-" + moduleName + ".json";
        log.debug({module:moduleName}, "Starting module");

        return fs.readFile(moduleConfigFile, 'utf8', function(err, data) {
          if (err) return callback(new Exception({moduleConfigFile:moduleConfigFile}, "Failed to load module configuration file", err));
          log.debug({moduleConfigFile:moduleConfigFile, data:data}, "Finished loading module configuration file");
          var moduleConfig = JSON.parse(data);
          return module.Module.start(config, moduleConfig, modules, function(err) {
            // Best effort: report the error and continue
            if (err) log.warn(new Exception({module:moduleName}, "Failed to start module", err));
            return startNextModule(remainingModules, callback);
          });
        });
      }

      return startNextModule(modules.slice(), function(err) {
        // As the module start is best effort, an error here is considered fatal
        if (err) return callback(new Exception(undefined, "Failed to start new module", err));

        /**
         * Start processing command line
         * Dispatch command execution to modules
         * Syntax: node willie.js <module options> <command> <command parameters>
         */
        if (process.argv.length <= 2) {
          return displayHelp(callback);
        }
        process.argv.shift();           // nodejs
        process.argv.shift();           // name of command (should be willie.js)
        var command = process.argv[0];  // command
        process.argv.shift();

        if (command === null || command === undefined || command === '' || command === 'help' ) {
          return displayHelp(callback);
        }

        /**
         * Update the database structure
         */
        return updateDatabaseStructure(config, function(err) {
          if (err) return callback(new Exception(undefined, "Failed to update the database structure", err));

          // Dispatch to module
          for( var i=0; i<modules.length; i++) {
            var module = modules[i];
            if (command === module.Module.moduleConfig.name) {
              return module.Module.command(process.argv, function(err) {
                return callback(err);
              });
            }  
          }

          log.error({module:command}, "Invalid module. Displaying help");
          displayHelp(callback);

        });

      });
    });

  };

  /**
   * Update the database structure
   */
  function updateDatabaseStructure(config, callback) {
    log.info("Updating the database structure");

    var adminContext = { authenticated:true, isAdmin:true, user:{}, rights:{} };
    var db = new Database(config.cnx);

    function _done(callback) {
      return Database.shutdown(function() {
        return callback();
      });
    }
    
    function _updateModuleDatabaseStructure(module, callback) {
      var config = module.Module.moduleConfig;
      return module.Module.loadTextFile('sql/update.sql', function(err, contents) {
        if (err) return callback(new Exception({module:config.name}, "Failed to load update.sql file from module", err));
        var commands = [contents];
        return db.executeSQL(adminContext, commands, function(err) {
          if (err) return callback(new Exception({module:config.name}, "Failed to execute the database SQL update scripts of module", err));

          return module.Module.loadTextFile('sql/data.sql', function(err, contents) {
            if (err) return callback(new Exception({module:config.name}, "Failed to load data.sql file from module", err));
            var commands = [contents];
            return db.executeSQL(adminContext, commands, function(err) {
              if (err) return callback(new Exception({module:config.name}, "Failed to execute the database SQL data scripts of module", err));

              return callback();
            });
          });
        });
      });
    }

    function _next(modules, callback) {
      if( modules.length === 0) return callback();
      var module = modules.shift();
      var moduleName = module.Module.moduleConfig.name;
      log.debug({remaining:modules.length, module:moduleName}, "Updating database structure for next module");
      return _updateModuleDatabaseStructure(module, function(err) {
        if (err) return callback(new Exception({module:moduleName}, "Failed to update the module database structure", err));
        return _next(modules, callback);
      });
    }

    return _next(modules.slice(), function(err) {
      return _done(function(err2) {
        if (err2) log.error(new Exception(undefined, "Failed to close database", err2));
        if (err) return callback(new Exception(undefined, "Failed to update Database Structure", err));
        return callback(); 
      });
    });
  }

  /**
   * help command: display help
   */
  function displayHelp(callback) {
    log.debug("Calling displayHelp");
    var help = "Willie Media Player\n" +
               "Usage: node willie.js [<module> <module options>] <command> <command parameters> | bunyan\n";
    for( var i=0; i<modules.length; i++) {
      var module = modules[i];
      help = help + "\n"
           + "Commands:\n"
           + "    help                          Display help\n";
      help = help + "\n";
      help = help + "=== Module [[" + module.moduleConfig.name + "]] === \n";
      log.debug({module:module.moduleConfig.name}, "Getting help string for module");
      help = help + module.getHelpString();
    }

    log.info({help:help}, "Displaying help");
    return callback();
  }

  /**
   * End of exceution: log error if any and stop processing
   */
  function done(err) {
    log.debug("Terminating");
    if (err) log.error(new Exception(undefined, "Command failed", err));
    function doneNextModule(index, callback) {
      if (index >= modules.length) {
        return callback();
      }
      var module = modules[index];
      return module.Module.shutdown(function(err2) {
        if (err2) log.error(new Exception(undefined, "Failed to shutdown module", err2));
        return doneNextModule(index+1, callback);
      });
    }
    return doneNextModule(0, function() {
      log.info("Done.");
      // Shut down logging
      return Log.shutdown(function(err) {
        if (err)
          console.error("Failed to shutdown logging system: ", err);
      });
    });
  }

  start(function(err) {
    done(err);
  });


});
