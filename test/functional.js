'use strict';

const Config = require('getconfig');

let lab = exports.lab = require('lab').script();
let expect = require('code').expect;
let describe = lab.describe;
let it = lab.test;
let before = lab.before;
let after = lab.after;

let Gatepost = require('../index');
let pg = require('pg');
let SQL = require('sql-template-strings');
let Joi = require('joi');
let knex = require('knex')({ client: 'pg', connection: Config.db.uri });

Gatepost.setConnection(Config.db.uri);

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

Author.fromSQL({
  name: 'addAuthorKnex',
  sql: (args, model) => knex('authors_tmp').insert({ name: model.name }).returning(['id', 'name']),
  instance: true,
  oneResult: true
});

Author.fromSQL({
  name: 'queryWithValidate',
  sql: (args, model) => SQL`SELECT * FROM authors_tmp WHERE name="${args.name}"`,
  validate: {
    name: Joi.string()
  }
});

Author.fromSQL({
  name: 'multiQuery',
  sql: (args, model) => {
    return [
      SQL`SELECT * FROM authors_tmp WHERE id=1`,
      SQL`SELECT * FROM authors_tmp WHERE id=2`,
      SQL`SELECT * FROM authors_tmp WHERE id=1`,
    ];
  }
})


describe('Add and remove', () => {

  before((done) => {

    Author.createTable((err) => {

      if (err) {
        throw err;
      }
      Author.createTable2((err) => {

        if (err) {
          throw err;
        }
        done();
      });
    });
  });

  after((done) => {

    Book.dropBook()
      .then(Author.dropAuthor)
      .then(() => {

        pg.end();
        done();
      })
      .catch((err) => console.log(err));
  });

  it('instance: create row', (done) => {

    let author = Author.create({name: 'Nathan Fritz'});
    author.addAuthor((err, a2) => {

      expect(err).to.be.null();
      expect(a2.id).to.equal(1);
      expect(a2.name).to.equal('Nathan Fritz');
      done();
    });
  });

  it('instance: create row knex', (done) => {

    let author = Author.create({name: "Nathan 'z"});
    author.addAuthorKnex((err, a2) => {

      expect(err).to.be.null();
      expect(a2.id).to.equal(2);
      expect(a2.name).to.equal("Nathan 'z");
      done();
    });
  });

  it('instance: create row fail', (done) => {

    let author = Author.create({name: 34});
    author.addAuthor((err, a2) => {

      expect(err).to.exist();
      done();
    });
  });

  it('model: getDB', (done) => {
    Author.getDB((err, db, close) => {
      expect(err).to.be.null();
      expect(db.connectionParameters.database).to.equal('gatepost_test');
      close();
      done();
    });
  });

  it('instance: getDB', (done) => {
    let author = Author.create({ name: 'Nathan Fritz' });
    author.getDB((err, db, close) => {
      expect(err).to.be.null();
      expect(db.connectionParameters.database).to.equal('gatepost_test');
      close();
      done();
    });
  })

  it('throws error on invalid query arguments', (done) => {
    Author.queryWithValidate({ name: 123 }, (err) => {
      expect(err).to.not.be.null();
      expect(err.name).to.equal('ValidationError');
      done();
    });
  });

  it('does not error on valid query arguments', (done) => {
    Author.queryWithValidate({ name: 'Nathan' }, (err) => {
      expect(err).to.not.be.null();
      expect(err.name).to.equal('ValidationError');
      done();
    });
  });

  it('multi queries are concatenated', (done) => {
    Author.multiQuery((err, results) => {
      expect(err).to.be.null();
      expect(results.length).to.equal(3);
      expect(results[0].id).to.equal(1);
      expect(results[1].id).to.equal(2);
      expect(results[2].id).to.equal(1);
      done();
    });
  });
});
