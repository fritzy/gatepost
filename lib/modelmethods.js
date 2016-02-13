'use strict';

const utils = require('./utils');
const assert = require('assert');

module.exports = {
  fromSQL: function (ropts) {

    assert.equal(typeof ropts, 'object');
    assert.equal(typeof ropts.name, 'string');
    assert.equal(typeof ropts.sql, 'function');

    if (ropts.instance) {
      return this.registerInstanceSQL(ropts);
    }
    return this.registerFactorySQL(ropts);
  },

  runQuery: function (opts, queries) {

    const db = this.getDB();
    return Promise.all(queries.map((query) => {

      return db.query(query);
    })).then((results) => {

      // flatten the array of arrays
      return results.reduce((a, b) => {

        return a.concat(b);
      }, []);
    }).then((results) => {

      if (results.length === 0 && (opts.required || opts.oneResult)) {
        return Promise.reject(new utils.EmptyResult());
      }

      if (opts.oneResult) {
        return results[0];
      }

      return results;
    });
  },


  prepOpts: function (opts) {

    if (!opts.model) {
      opts.model = this;
    } else if (typeof opts.model === 'string') {
      opts.model = this.getModelByName(opts.model);
    }
    return opts;
  },

  registerFactorySQL: function (opts) {

    if (typeof this[opts.name] !== 'undefined') {
      throw new Error(`Gatepost Model "${this.options.name}" already has a property named "${opts.name}"`);
    }
    opts = this.prepOpts(opts);
    this[opts.name] = (_args) => {

      const args = Object.assign({}, opts.defaults, _args);

      return utils.validateArgs(args, opts)
              .then((queryArgs) => utils.prepQuery(opts.sql, queryArgs, null, this, opts.name))
              .then((query) => this.runQuery(opts, query));
    };
  },

  registerInstanceSQL: function (opts) {

    if (typeof this.controllers[opts.name] !== 'undefined') {
      throw new Error(`Instances of Gatepost Model "${this.options.name}" already have a property named "${opts.name}"`);
    }
    const extension = {};
    opts = this.prepOpts(opts);
    extension[opts.name] = function (_args) {

      const args = Object.assign({}, opts.defaults, _args);

      return utils.validateArgs(args, opts)
              .then((queryArgs) => {
                const errors = this.doValidate();
                if (errors.error !== null) {
                  throw errors.error;
                }
                return queryArgs;
              })
              .then((queryArgs) => utils.prepQuery(opts.sql, queryArgs, this, this.__verymeta.model, `inst-${opts.name}`))
              .then((query) => this.__verymeta.model.runQuery(opts, query));
    };
    this.extendModel(extension);
  }

};
