'use strict';

const Joi = require('joi');

// Position the bindings for the query. The escape sequence for question mark
// is \? (e.g. knex.raw("\\?") since javascript requires '\' to be escaped too...)
function positionBindings(sql) {

  let questionCount = 0;
  return sql.replace(/(\\*)(\?)/g, (match, escapes) => {
    if (escapes.length % 2) {
      return '?';
    }
    questionCount++;
    return `\$${questionCount}`;
  });
}

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
      query = { text: query };
    }
    return query;
  });
  return queries;
}

function EmptyResult() {
  Error.apply(this, arguments);
  this.name = 'EmptyResult';
}

EmptyResult.prototype = Object.create(Error.prototype);

module.exports = { positionBindings, validateArgs, prepQuery, EmptyResult };
