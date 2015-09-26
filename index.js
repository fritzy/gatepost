"use strict";

let verymodel = require('verymodel');
let lodash = require('lodash');
let assert = require('assert');
let util = require('util');
let pg = require('pg');
let shortid = require('shortid');

let default_connection;

let model_cache = {};

function Model() {
  verymodel.VeryModel.apply(this, arguments);
  if (!this.options.connection) this.options.connection = default_connection;
  if (!this.options.hasOwnProperty('name')) {
    this.options.name = shortid();
  }
  model_cache[this.options.name] = this;

  this.getDB = function (callback) {
    pg.connect(this.options.connection, function (err, client, done) {

      if (err) {
        return err;
      }

      return callback(null, client, done);
    });
  };

  let model = this;

  this.extendModel({
    getDB: function (callback) {
      pg.connect(model.options.connection, function (err, client, done) {

        if (err) {
          return err;
        }

        return callback(null, client, done);
      });
    }
  });

  this.genInsert = function (ropts) {
    assert.equal(typeof ropts, 'object');
    assert.equal(typeof ropts.table, 'string');
    assert.equal(typeof model.primary, 'string', "This model needs a primary field.");

    this.extendModel({
      insert: function (callback) {
        let input = this.toJSON({withPrivate: true, withAliases: true});
        let keys;
        if (Array.isArray(ropts.fields)) {
          keys = ropts.fields;
        } else {
          keys = Object.keys(input).filter(function (key) {
            if (model.getDefinition(key).sqlField === false) {
              return false;
            }
            return true;
          });
        }
        let fieldq = " (" + keys.join(", ") + ")";
        let valueq = " values (" + keys.map(function (key) {
          return "$" + key;
        }).join(", ") + ")";
        let query = util.format("INSERT INTO %s %s %s RETURNING %s", ropts.table, fieldq, valueq, model.alias[model.primary])
        this.getDB(function (err, client, dbDone) {
          if (err) {
            dbDone();
            return callback(err);
          }

          return client.query(query, input, function (err, result) {
            if (!err && result.rows.length > 0) {
              this.id = result.rows[0].id;
              dbDone();
              return callback(err, this);
            }
            dbDone();
            return callback(err);
          }.bind(this));
        }.bind(this));
      },
    });
  };

  this.genUpdate = function (ropts) {
    assert.equal(typeof ropts, 'object');
    assert.equal(typeof ropts.table, 'string', "Specify a table.");
    assert.equal(typeof model.primary, 'string', "This model needs a primary field.");
    assert.equal(typeof model.get, 'function', util.format("This model, %n needs a get function.", model.options.name));
    this.extendModel({
      update: function (callback) {
        let changes = this.getChanges();
        let query = util.format("UPDATE %s SET", ropts.table);
        let sets = [];
        Object.keys(changes).forEach(function (field) {
          if (changes[field].changed && model.getDefinition(field).sqlField !== false) {
            sets.push(util.format(" %s=$%s", model.alias[field], field));
          }
        });
        if (sets.length === 0) {
          return callback("No fields were updated", this);
        }
        query += sets.join(", ");
        query += util.format(" WHERE %s=$%s", model.alias[model.primary], model.primary);
        this.getDB(function (err, client, dbDone) {
          if (err) {
            dbDone();
            return callback(err);
          }

          return client.query(query, this.toJSON({withPrivate: true}), function (err, result) {
            if (!err) {
              dbDone();
              return callback(err, this);
            }
            dbDone();
            return callback(err);
          }.bind(this));
        }.bind(this));
      }
    });
    this.update = function (id, payload, callback) {
      this.get(id, function (err, model) {
        if (err) {
          return callback(err, null);
        }
        Object.keys(payload).forEach(function (key) {
          model[key] = payload[key];
        });
        model.update(callback);
      });
    };
  }

}

Model.prototype = Object.create(verymodel.VeryModel.prototype);

(function () {

  this.fromSQL = function (ropts) {
    assert.equal(typeof ropts, 'object');
    if (ropts.instance) {
      return this.registerInstanceSQL(ropts);
    }
    return this.registerFactorySQL(ropts);
  }

  function prepQuery(func, args, inst, model, name) {
    let query = func.call(args, args, inst, model);
    if (typeof query === 'string') {
      query = {
        text: query,
        values: []
      }
    }
    query.name = `${this.options.name}-${name}`;
    return query;
  }

  this.registerFactorySQL = function (ropts) {
    assert.equal(typeof ropts.name, 'string');
    assert(typeof ropts.sql === 'function');

    this[ropts.name] = function (opts, callback) {
      //needs a callback, but opts are optional
      callback = typeof opts === 'function' ? opts : callback;

      if (ropts.oneArg !== true) {
        opts = typeof opts === 'object' ? opts : {};
      } else {
        opts = {'arg': opts};
      }
      if (ropts.hasOwnProperty('defaults')) {
        assert.equal(typeof ropts.defaults, 'object');
        opts = lodash.defaults(opts, ropts.defaults);
      }
      this.getDB(function (err, client, dbDone) {
        let query;
        if (err) {
          dbDone();
          return callback(err);
        }

        query = prepQuery.call(this, ropts.sql, opts, null, this, ropts.name);

        return client.query(query, function (err, results) {
          let rows = [];
          if (!err) {
            results.rows.forEach(function (row) {
               rows.push(this.create(row));
            }.bind(this));
          }
          if (ropts.oneResult === true) {
            if (rows.length > 0) {
              dbDone();
              return callback(err, rows[0]);
            }
            if (ropts.required === true) {
              dbDone();
              return callback('required_row_not_returned', null);
            }
            dbDone();
            return callback(err, null);
          }
          dbDone();
          callback(err, rows);
        }.bind(this));
      }.bind(this));
    }.bind(this);
  };

  this.registerInstanceSQL = function (ropts) {
    let model = this;
    if (!ropts.model) {
      ropts.model = this;
    }
    if (typeof ropts.model === 'string') {
      ropts.model = model_cache[ropts.model];
    }
    assert.equal(typeof ropts.name, 'string');
    assert(typeof ropts.sql === 'function');
    let extension = {};
    extension[ropts.name] = function (opts, callback) {
      if (typeof opts === 'function') {
        cb = opts;
        opts = {};
      }
      let inst = this;
      if (ropts.asJSON) {
        inst = {};
        inst[model.options.name] = this.toJSON();
      }
      this.getDB(function (err, client, dbDone) {
        let query;

        if (err) {
          dbDone();
          return callback(err);
        }

        query = prepQuery.call(this.__verymeta.model, ropts.sql, opts, inst, this.__verymeta.model, `inst-${ropts.name}`);

        client.query(query, function (err, results) {
          let rows = [];
          if (!err) {
            results.rows.forEach(function (row) {
               rows.push(ropts.model.create(row));
            }.bind(this));
          }
          if (ropts.oneResult === true) {
            if (rows.length > 0) {
              dbDone();
              return callback(err, rows[0]);
            }
            dbDone();
            return callback(err, null);
          }
          dbDone();
          callback(err, rows);
        }.bind(this));
      }.bind(this));
    };
    this.extendModel(extension);
  };

}).call(Model.prototype);



module.exports = {
  setConnection: function (connection) {
    default_connection = connection;
  },
  Model: Model,
  SQL: require('sql-template-strings'),
  getClient: function (callback) {
    pg.connect(default_connection, function (err, client, done) {

      if (err) {
        return err;
      }

      return callback(null, client, done);
    });
  }
}
