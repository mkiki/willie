/**
 * Willie - Configuration tests
 *
 * (C) Alexandre Morin 2015 - 2016
 */

const assert = require('assert');
const Config = require('../lib/config.js');

describe('Config', function() {

  it('Should load file', function(done) {
    return Config.load(__dirname + "/data/config1.json", function(err, config) {
      if (err) return done(err);
      assert (config.version === "1.3.0",                                   "Checking version");
      assert (config.env === "dev",                                         "Checking environment");
      assert (config.cnx === "postgres://db_user:db_password@db_host/db_name",   "Checking database connection");
      assert (config.web.port === 3000,                                     "Checking server port");
      return done();      
    });
  });

  it('Should fail to load file', function(done) {
    return Config.load(__dirname + "/data/config-do-not-exist.json", function(err, config) {
      assert (err !== null && err !== undefined,                            "Checking for error");
      return done();      
    });
  });

  
});


