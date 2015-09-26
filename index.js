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
    pg.connect(this.options.connection, function (err, db, done) {
      callback(err, db, done);
    });
  };

  let model = this;

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

  this.runQuery = function (ropts, query, callback) {
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
             rows.push(this.create(row));
          });
          if (rows.length === 0 && (ropts.required || ropts.oneResult)) {
            rows = null;
          } else if (ropts.oneResult === true && rows.length > 0) {
              rows = rows[0];
          }
          if (callback) callback(err, rows);
          return err ? reject(err) : resolve(rows);
        });
      });
    });
  };

  this.registerFactorySQL = function (ropts) {

    this[ropts.name] = (opts, callback) => {
      callback = typeof opts === 'function' ? opts : callback;

      if (ropts.oneArg !== true) {
        opts = typeof opts === 'object' ? opts : {};
      } else {
        opts = {'arg': opts};
      }
      ropts.defaults = ropts.defaults || {};
      opts = lodash.defaults(opts, ropts.defaults);
      
      let query = prepQuery.call(this, ropts.sql, opts, null, this, ropts.name);
      return this.runQuery(ropts, query, callback);
    };
  };

  this.registerInstanceSQL = function (ropts) {
    if (!ropts.model) {
      ropts.model = this;
    }
    if (typeof ropts.model === 'string') {
      ropts.model = model_cache[ropts.model];
    }
    let extension = {};
    extension[ropts.name] = function (opts, callback) {
      callback = typeof opts === 'function' ? opts : callback;
      let inst = this;
      if (ropts.asJSON) {
        inst = {};
        inst[ropts.model.options.name] = this.toJSON();
      }
      
      let query = prepQuery.call(this.__verymeta.model, ropts.sql, opts, inst, this.__verymeta.model, `inst-${ropts.name}`);
      return this.__verymeta.model.runQuery(ropts, query, callback);
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
