"use strict";

let verymodel = require('verymodel');
let lodash = require('lodash');
let assert = require('assert');
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

  this.runQuery = function (opts, query, callback) {
    return new Promise((resolve, reject) => {
      this.getDB((err, client, dbDone) => {
        if (err) {
          dbDone();
          if (callback) callback(err);
          return reject(err);
        }
        return client.query(query, (err, results) => {
          dbDone();
          let rows = [];
          if (err) {
            if (callback) callback(err);
            return reject(err);
          }
          results.rows.forEach((row) => {
             rows.push(opts.model.create(row));
          });
          if (rows.length === 0 && (opts.required || opts.oneResult)) {
            rows = null;
          } else if (opts.oneResult === true && rows.length > 0) {
              rows = rows[0];
          }
          if (callback) callback(err, rows);
          return err ? reject(err) : resolve(rows);
        });
      });
    });
  };

  function prepArgs(args, callback, opts) {
    callback = typeof args === 'function' ? args : callback;
    args = opts.oneArg ? {arg: args} : args;
    args = typeof args === 'object' ? args : {};
    args = lodash.defaults(args, opts.defaults || {});
    return {callback, args};
  }

  function prepQuery(func, args, inst, model, name) {
    let query = func.call(args, args, inst, model);
    //if knex query builder
    if (typeof query === 'object' && query.constructor.name === 'QueryBuilder') {
      query = query.toString();
    }
    if (typeof query === 'string') {
      query = {text: query};
    }
    query.name = `${model.options.name}-${name}`;
    return query;
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
    opts = this.prepOpts(opts);
    this[opts.name] = (args, callback) => {
      let config = prepArgs(args, callback, opts, this);
      let query = prepQuery(opts.sql, config.args, null, this, opts.name);
      return this.runQuery(opts, query, config.callback);
    };
  };

  this.registerInstanceSQL = function (opts) {
    let extension = {};
    opts = this.prepOpts(opts);
    extension[opts.name] = function (args, callback) {
      let config = prepArgs(args, callback, opts);
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
