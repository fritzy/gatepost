#Gatepost: Bind to Models From SQL

![picture of fence with gate](https://cldup.com/6MNZCYtzkw.png)

[![npm i gatepost](https://nodei.co/npm/gatepost.png)](https://www.npmjs.com/package/gatepost)

Gatepost facilitates binding SQL statements to Model factories and instances, with the results cast as Model instance.
With most ORMs have you model the database schema, but with Gatepost, you're not concerned with the database structure, only with what your queries return.

Gatepost uses [VeryModel](https://github.com/fritzy/verymodel) for Model factories and instances, giving you a lot of flexibility such as sharing your validation between your API and database, auto-converting values, etc.

Feel free to use knex, template strings, or other methods for generating your SQL. Gatepost is designed to stay out of your way.

```javascript
'use strict';

const Gatepost = require('gatepost')('postgres://localhost/gatepost_test');
const SQL = require('sql-template-string'); //propery breaks out SQL template strings into a separate array to prevent SQL injection and errors

const Book = new Gatepost.Model({
  title: {
    validate: Joi.string()
  },
  id: {}
}, {
  cache: true,
  name: 'Book'
});

const knex = require('knex')({dialect: 'pg'});

//knex query builders are dealt with automatically
Book.fromSQL({
  name: 'getByCategory',
  sql: (args) => knex.select('id', 'title', 'author')
  .from('books').where({category: args.category})
});

Book.getByCategory({category: 'cheese'}).then(results) {
  results.forEach((book) => console.log(book.toJSON());
}).catch((err) => {
  console.log("error!!!!");
});
```

```javascript
"use strict"

let SQL = require('sql-template-strings');
//sql-template-strings template tag returns a {text, values} object
//which gets turned into a prepare statement by gatepost

Book.fromSQL({
  name: 'insert',
  //using a template string
  sql: (args, model) => SQL`INSERT INTO books
(title, author, category)
VALUES (${model.title}, ${model.author}, ${model.category})
RETURNING id`,
  instance: true,
  oneResult: true
});

let book = Book.create({title: 'Ham and You', author: 'Nathan Fritz', category: 'ham'});

//using promises
book.insert()
.then((result) => console.log(`Book ID: ${book.id}`))
.catch((error) => console.log(`Gadzoons and error! ${error}`));
```

# Model extensions

See [VeryModel documentation](https://github.com/fritzy/verymodel) for information on using `gatepost.Model`s.

##Model options:

 * `name`: [string] used for naming the model
 * `cache`: [boolean] to refer to the model by string

## Functions

### fromSQL

Generate a Factory or Instance method from SQL for your Model

#### Arguments:

 * `options`: [object]

#### Options

 * `name`: [string] method name
 * `sql`: [function] returns the query object or string for pg.query or array of these.
 * `oneResult`: [boolean] only get one model intance or rejects with new gatepost.EmptyResult
 * `instance`: [boolean] Add the method to model instances rather than the factory.
 * `model`: [Model or string] cast the results into this model
 * `validate`: [Joi Schema] validate the args with this [Joi Schema](https://npmjs.org/package/joi)
 * `validateOps`: [object] Options passed to Joi.validate when validating arguments
 * `validateModel`: [boolean] True by default, instanced methods will validate the model (second arg) before running query.

#### Generated Method

`function (args);`

 * `args`: [object unless oneArg set] optional, the first argument passed to the `sql` function

returns `Promise`


#### Returned Promise

Calling a method generated from `fromSQL` returns a [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise) which will `then` with the `results`, `catch` with a Postgres error from [pg](https://npmjs.org/package/pg) or gatepost.EmptyResult.

#### SQL Function

 * `args`: [object] arguments passed as the first option
 * `model`: [Model] for instances, the model instance that the function is called to

#### Examples

```javascript
let knex = require('knex')({dialect: 'pg'});

//knex query builders are dealt with automatically
Book.fromSQL({
  name: 'getByCategory',
  sql: (args) => knex.select('id', 'title', 'author')
  .from('books').where({category: args.category})
});

Book.getByCategory({category: 'cheese'}).then(results) {
  results.forEach((book) => console.log(book.toJSON());
}).catch((err) => {
  //...
});
```

```javascript
let SQL = require('sql-template-strings');

//sql-template-strings template tag returns a {text, values} object
//which gets turned into a prepare statement by gatepost
Book.fromSQL({
  name: 'insert',
  //using a template string
  sql: (args, model) => SQL`INSERT INTO books
(title, author, category)
VALUES (${model.title}, ${model.author}, ${model.category})
RETURNING id`,
  instance: true,
  oneResult: true
});

let book = Book.create({title: 'Ham and You', author: 'Nathan Fritz', category: 'ham'});

//using promises
book.insert()
.then((result) => console.log(`Book ID: ${book.id}`))
.catch((error) => console.log(`Gadzoons and error! ${error}`));
```

### setConnection

Configure the `pg` postgres client with gatepost to use for queries. Accepts anything valid in the first parameter of [pg.connect](https://github.com/brianc/node-postgres/wiki/pg#parameters).

## Running Tests

Either create a database called testdb or `cp config/default.json config/local.json` and update the uri.

Then run `npm test`

## LICENSE

The MIT License (MIT)

Copyright (c) 2015 Nathanael C. Fritz

See LICENSE for the full text.
