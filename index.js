"use strict";

const verymodel = require('verymodel');
const assert = require('assert');
const pgp = require('pg-promise')({ pgFormatting: true });
const Joi = require('joi');

let default_connection;

// Position the bindings for the query. The escape sequence for question mark
// is \? (e.g. knex.raw("\\?") since javascript requires '\' to be escaped too...)
function positionBindings(sql) {

  let questionCount = 0;
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

  this.getDB = function () {

    return pgp(this.options.connection);
  };

  this.extendModel({
    getDB: function (callback) {

      return pgp(this.__verymeta.connection);
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

  this.runQuery = function (opts, queries) {

    const db = this.getDB();
    return Promise.all(queries.map(function (query) {

      return db.query(query);
    })).then((results) => {

      // flatten the array of arrays
      return results.reduce((a, b) => {

        return a.concat(b);
      }, []);
    }).then((results) => {

      if (results.length === 0 && (opts.required || opts.oneResult)) {
        return null;
      }

      if (opts.oneResult) {
        return results[0];
      }

      return results;
    });
  };

  function validateArgs(args, opts) {

    if (!opts.validate) {
      return Promise.resolve(args);
    }

    return new Promise((resolve, reject) => {

      Joi.validate(args, opts.validate, opts.validateOpts, (err, result) => {

        if (err) {
          return reject(err);
        }

        return resolve(result);
      });
    });
  }

  function prepQuery(func, args, inst, model, name) {

    let queries = func.call(args, args, inst, model);

    if (!Array.isArray(queries)) {
      queries = [queries];
    }

    queries = queries.map((query) => {

      //if knex query builder
      if (typeof query === 'object' && query.constructor.name === 'QueryBuilder') {
        const knexQuery = query.toSQL();
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
    this[opts.name] = (_args) => {

      const args = Object.assign({}, opts.defaults, _args);

      return validateArgs(args, opts)
              .then((queryArgs) => prepQuery(opts.sql, queryArgs, null, this, opts.name))
              .then((query) => this.runQuery(opts, query));
    };
  };

  this.registerInstanceSQL = function (opts) {

    if (typeof this.controllers[opts.name] !== 'undefined') {
      throw new Error(`Instances of Gatepost Model "${this.options.name}" already have a property named "${opts.name}"`);
    }
    const extension = {};
    opts = this.prepOpts(opts);
    extension[opts.name] = function (_args) {

      const args = Object.assign({}, opts.defaults, _args);

      return validateArgs(args, opts)
              .then((queryArgs) => {
                const errors = this.doValidate();
                if (errors.error !== null) {
                  throw errors.error;
                }
                return queryArgs;
              })
              .then((queryArgs) => prepQuery(opts.sql, queryArgs, this, this.__verymeta.model, `inst-${opts.name}`))
              .then((query) => this.__verymeta.model.runQuery(opts, query));
    };
    this.extendModel(extension);
  };

}).call(Model.prototype);

module.exports = {
  setConnection: function (connection) {
    default_connection = connection;
  },
  Model: Model,
  getClient: function () {
    return pgp(default_connection);
  }
}
