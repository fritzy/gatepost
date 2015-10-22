"use strict";

let verymodel = require('verymodel');
let lodash = require('lodash');
let assert = require('assert');
let pg = require('pg');
let async = require('async');
let Joi = require('joi');

let default_connection;

// Position the bindings for the query. The escape sequence for question mark
// is \? (e.g. knex.raw("\\?") since javascript requires '\' to be escaped too...)
function positionBindings(sql) {
  var questionCount = 0;
  return sql.replace(/(\\*)(\?)/g, function (match, escapes) {
    if (escapes.length % 2) {
      return '?';
    } else {
      questionCount++;
      return '$' + questionCount;
    }
  });
}

function Model() {
  verymodel.VeryModel.apply(this, arguments);
  if (!this.options.connection) this.options.connection = default_connection;

  this.getDB = function (callback) {
    pg.connect(this.options.connection, function (err, db, done) {
      callback(err, db, done);
    });
  };

  this.extendModel({
    getDB: function (callback) {
      pg.connect(model.options.connection, function (err, db, done) {
        callback(err, db, done);
      });
    }
  });
}

Model.prototype = Object.create(verymodel.VeryModel.prototype);

(function () {

  this.fromSQL = function (ropts) {
    assert.equal(typeof ropts, 'object');
    assert.equal(typeof ropts.name, 'string');
    assert.equal(typeof ropts.sql, 'function');

    if (ropts.instance) {
      return this.registerInstanceSQL(ropts);
    }
    return this.registerFactorySQL(ropts);
  }

  this.runQuery = function (opts, queries, callback) {
    return new Promise((resolve, reject) => {
      if (opts.validationError) {
        if (callback) {
          callback(opts.validationError);
        }
        return reject(opts.validationError);
      }
      this.getDB((err, client, dbDone) => {
        if (err) {
          dbDone();
          if (callback) callback(err);
          return reject(err);
        }
        async.reduce(queries, [], (rows, query, nextCB) => {
          client.query(query, (err, results) => {
            if (err) {
              return nextCB(err);
            }
            results.rows.forEach((row) => {
               rows.push(opts.model.create(row));
            });
            nextCB(undefined, rows);
          });
        }, (err, rows) => {
          if (!err) {
            if (rows.length === 0 && (opts.required || opts.oneResult)) {
              rows = null;
            } else if (opts.oneResult === true && rows.length > 0) {
                rows = rows[0];
            }
          }
          dbDone();
          if (callback) callback(err, rows);
          return err ? reject(err) : resolve(rows);
        });
      });
    });
  };

  function prepArgs(args, callback, opts) {
    callback = typeof args === 'function' ? args : callback;
    args = typeof args === 'object' ? args : {};
    args = lodash.defaults(args, opts.defaults || {});
    opts.validateOpts = opts.validateOpts || null;
    if (opts.validate) {
      let valRes = Joi.validate(args, opts.validate, opts.validateOpts);
      if (valRes.error) {
        opts.validationError = valRes.error;
      } else {
        args = valRes.value;
      }
    }
    return {callback, args};
  }

  function prepQuery(func, args, inst, model, name) {
    let queries = func.call(args, args, inst, model);

    if (!Array.isArray(queries)) {
      queries = [queries];
    }

    queries = queries.map((query) => {

      //if knex query builder
      if (typeof query === 'object' && query.constructor.name === 'QueryBuilder') {
        let knexQuery = query.toSQL();
        query = {
          text: positionBindings(knexQuery.sql),
          values: knexQuery.bindings
        };
      }
      if (typeof query === 'string') {
        query = {text: query};
      }
      return query;
    });
    return queries;
  }

  this.prepOpts = function (opts) {
    if (!opts.model) {
      opts.model = this;
    } else if (typeof opts.model === 'string') {
      opts.model = model_cache[opts.model];
    }
    return opts;
  };

  this.registerFactorySQL = function (opts) {
    if (typeof this[opts.name] !== 'undefined') {
      throw new Error(`Gatepost Model "${this.options.name}" already has a property named "${opts.name}"`);
    }
    opts = this.prepOpts(opts);
    this[opts.name] = (args, callback) => {
      let config = prepArgs(args, callback, opts, this);
      let query = prepQuery(opts.sql, config.args, null, this, opts.name);
      return this.runQuery(opts, query, config.callback);
    };
  };

  this.registerInstanceSQL = function (opts) {
    if (typeof this.controllers[opts.name] !== 'undefined') {
      throw new Error(`Instances of Gatepost Model "${this.options.name}" already have a property named "${opts.name}"`);
    }
    let extension = {};
    opts = this.prepOpts(opts);
    extension[opts.name] = function (args, callback) {
      let config = prepArgs(args, callback, opts);
      let errors = this.doValidate();
      if (errors.error !== null) {
        opts.validationError = errors.error;
      }
      let query = prepQuery(opts.sql, config.args, this, this.__verymeta.model, `inst-${opts.name}`);
      return this.__verymeta.model.runQuery(opts, query, config.callback);
    };
    this.extendModel(extension);
  };

}).call(Model.prototype);

module.exports = {
  setConnection: function (connection) {
    default_connection = connection;
  },
  Model: Model,
  getClient: function (callback) {
    pg.connect(default_connection, callback);
  }
}
