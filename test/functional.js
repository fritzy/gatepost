'use strict';

const Config = require('getconfig');

const lab = exports.lab = require('lab').script();
const expect = require('code').expect;
const describe = lab.describe;
const it = lab.test;
const before = lab.before;
const after = lab.after;

const Gatepost = require('../index')(Config.db.uri);
const pg = require('pg');
const SQL = require('sql-template-strings');
const Joi = require('joi');
const knex = require('knex')({ client: 'pg', connection: Config.db.uri });
const utils = require('../lib/utils');

const Author = new Gatepost.Model({
  name: {
    validate: Joi.string()
  },
  id: {}
}, {
  cache: true,
  name: 'Author'
});

const Book = new Gatepost.Model({
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
  oneResult: true,
  model: Author
});

Author.fromSQL({
  name: 'emptyResult',
  sql: (args, model) => SQL`SELECT * from authors_tmp WHERE 1=2`,
  required: true,
  model: 'Author'
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
      SQL`SELECT * FROM authors_tmp WHERE id=1`
    ];
  }
});

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
    }).catch(done);
  });

  after((done) => {

    pg.end();
    done();
  });

  it('instance: create row', (done) => {

    const author = Author.create({ name: 'Nathan Fritz' });
    author.addAuthor().then((a2) => {

      expect(a2.id).to.equal(1);
      expect(a2.name).to.equal('Nathan Fritz');
      done();
    }).catch(done);
  });

  it('instance: create row knex', (done) => {

    const author = Author.create({ name: 'Nathan \'z' });
    author.addAuthorKnex().then((a2) => {

      expect(a2.id).to.equal(2);
      expect(a2.name).to.equal('Nathan \'z');
      done();
    }).catch(done);
  });

  it('instance: create row fail', (done) => {

    const author = Author.create({ name: 34 });
    author.addAuthor().then(done).catch((err) => {

      expect(err).to.exist();
      done();
    });
  });

  it('model: getDB', (done) => {

    const db = Author.getDB();
    expect(db.constructor.name).to.equal('Database');
    done();
  });

  it('instance: getDB', (done) => {

    const author = Author.create({ name: 'Nathan Fritz' });
    const db = author.getDB();
    expect(db.constructor.name).to.equal('Database');
    done();
  });

  it('throws error on invalid query arguments', (done) => {
    Author.queryWithValidate({ name: 123 }).then(done).catch((err) => {

      expect(err).to.not.be.null();
      expect(err.name).to.equal('ValidationError');
      done();
    });
  });

  it('add a duplicate method', (done) => {
    expect(() => {
      Author.fromSQL({
        name: 'getJSON',
        sql: (args, model) => SQL`SELECT ('{"name": "Bill"}')::JSON as name WHERE 1=2`,
        oneResult: true
      });
    }).to.throw();
    done();
  });

  it('add a duplicate instance method', (done) => {
    expect(() => {
      Author.fromSQL({
        name: 'addAuthorKnex',
        sql: (args, model) => knex('authors_tmp').insert({ name: model.name }).returning(['id', 'name']),
        instance: true,
        oneResult: true
      });
    }).to.throw();
    done();
  });

  it('throws error on invalid query arguments', (done) => {
    Author.emptyResult().then(() => {
      done(new Error('Should have had error'));
    }).catch((err) => {
      expect(err).to.not.be.null();
      expect(err.name).to.equal('EmptyResult');
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
      done(new Error('Should have had error'));
    }).catch((err) => {
      expect(err).to.not.be.null();
      expect(err.name).to.equal('EmptyResult');
      done();
    });
  });

  it('position bindings escaped question-mark', (done) => {
    const sql = utils.positionBindings('SELECT \\?');
    expect(sql).to.equal('SELECT ?');
    done();
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
