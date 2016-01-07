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
  sql: (args, model) => SQL`SELECT * FROM authors_tmp WHERE name=${args.name}`,
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


Author.fromSQL({
  name: 'getJSON',
  sql: (args, model) => SQL`SELECT ('{"name": "Bill"}')::JSON as name WHERE 1=2`,
  oneResult: true
});


describe('Add and remove', () => {

  before((done) => {

    Author.createTable().then(() => {
      return Author.createTable2();
    }).then(() => {

      done();
    }).catch((err) => console.log(err));
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
    author.addAuthor().then((a2) => {

      expect(a2.id).to.equal(1);
      expect(a2.name).to.equal('Nathan Fritz');
      done();
    }).catch((err) => {

      throw err;
    });
  });

  it('instance: create row knex', (done) => {

    let author = Author.create({name: "Nathan 'z"});
    author.addAuthorKnex().then((a2) => {

      expect(a2.id).to.equal(2);
      expect(a2.name).to.equal("Nathan 'z");
      done();
    }).catch(done);
  });

  it('instance: create row fail', (done) => {

    let author = Author.create({name: 34});
    author.addAuthor().then(done).catch((err) => {

      expect(err).to.exist();
      done();
    });
  });

  it('model: getDB', (done) => {

    let db = Author.getDB();
    // expect(db.connectionParameters.database).to.equal('gatepost_test');
    done();
  });

  it('instance: getDB', (done) => {

    let author = Author.create({ name: 'Nathan Fritz' });
    let db = author.getDB();
    // expect(db.connectionParameters.database).to.equal('gatepost_test');
    done();
  })

  it('throws error on invalid query arguments', (done) => {
    Author.queryWithValidate({ name: 123 }).then(done).catch((err) => {

      expect(err).to.not.be.null();
      expect(err.name).to.equal('ValidationError');
      done();
    });
  });

  it('does not error on valid query arguments', (done) => {
    Author.queryWithValidate({ name: 'Nathan' }).then(() => {

      return done();
    }).catch(done);
  });

  it('does not get a model back when where fails', (done) => {
    Author.getJSON({}).then((model) => {

      expect(model).to.be.null();
      done();
    }).catch(done);
  });

  it('multi queries are concatenated', (done) => {
    Author.multiQuery().then((results) => {
      expect(results.length).to.equal(3);
      expect(results[0].id).to.equal(1);
      expect(results[1].id).to.equal(2);
      expect(results[2].id).to.equal(1);
      done();
    }).catch(done);
  });
});
