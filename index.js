'use strict';

const verymodel = require('verymodel');
const pgp = require('pg-promise')({ pgFormatting: true });
const lodashAssign = require('lodash.assign');
const modelPrototype = require('./lib/modelmethods');
const EmptyResult = require('./lib/utils').EmptyResult;

module.exports = function (default_connection) {

  const model_cache = {};

  function Model() {
    verymodel.VeryModel.apply(this, arguments);
    model_cache[this.options.name] = this;

    this.getModelByName = function (name) {
      return model_cache[name];
    };

    /* $lab:coverage:off$ */
    if (!this.options.connection) {
      this.options.connection = default_connection;
    }
    /* $lab:coverage:on$ */

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
  lodashAssign(Model.prototype, modelPrototype);

  return {
    Model: Model,
    /* $lab:coverage:off$ */
    setConnection: function (connection) {
      default_connection = connection;
    },
    getClient: function () {
      return pgp(default_connection);
    },
    /* $lab:coverage:on$ */
    EmptyResult
  };

};
