'use strict';

process.on('exception', function (err) {
  console.log(err.stack);
  throw err;
});

let Gatepost = require('../index');
let config = require('getconfig');
let pg = require('pg');
let SQL = require('sql-template-strings');
let Joi = require('joi');

Gatepost.setConnection(config.db.uri);

let dbDone, db;

let Author = new Gatepost.Model({
  name: {
    validate: Joi.string()
  },
  id: {}
}, {
  cache: true,
  name: 'Author'
});

let Book = new Gatepost.Model({
  title: {
    validate: Joi.string()
  },
  id: {}
}, {
  cache: true,
  name: 'Book'
});

Author.fromSQL({
  name: 'createTable',
  sql: () => `CREATE TEMP TABLE authors_tmp
  (id SERIAL PRIMARY KEY, name TEXT)`
});

Author.fromSQL({
  name: 'createTable2',
  sql: () => `CREATE TEMP TABLE books_tmp
  (id SERIAL PRIMARY KEY, author_id INTEGER REFERENCES authors_tmp(id), title TEXT)`
});

Author.fromSQL({
  name: 'dropAuthor',
  sql: () => `DROP TABLE authors_tmp`
});

Book.fromSQL({
  name: 'dropBook',
  sql: () => `DROP TABLE books_tmp`
});

Author.fromSQL({
  name: 'addAuthor',
  sql: (args, model) => SQL`INSERT INTO authors_tmp (name) VALUES (${model.name}) RETURNING id, name`,
  instance: true,
  oneResult: true
});

module.exports = {
  setUp: (done) => {
    done();
  },
  tearDown: (done) => {
    done();
  },
  "creating temp tables": (test) => {
    Author.createTable((err) => {
      test.ifError(err);
      Author.createTable2((err) => {
        test.ifError(err);
        test.done();
      });
    });
  },
  "instance: create row": (test) => {
    let author = Author.create({name: 'Nathan Fritz'});
    author.addAuthor((err, a2) => {
      test.ifError(err);
      test.equals(a2.id, 1);
      test.equals(a2.name, 'Nathan Fritz');
      test.done();
    });
  },
  "instance: create row fail": (test) => {
    let author = Author.create({name: 34});
    author.addAuthor((err, a2) => {
      test.ok(err);
      test.done();
    });
  },
  "override factory fail": (test) => {
    test.throws(() => {
      Author.fromSQL({
        name: 'create',
        sql: () => `POOOOO`
      });
    });
    test.done()
  },
  "override instance fail": (test) => {
    test.throws(() => {
      Author.fromSQL({
        name: 'addAuthor',
        sql: () => `POOOOO`,
        instance: true
      });
    });
    test.done()
  },
  done: (test) => {
    Book.dropBook().then(() => {
      return Author.dropAuthor();
    }).then(() => {
      pg.end();
      test.done();
    })
    .catch((err) => console.log(err));
  }
};
