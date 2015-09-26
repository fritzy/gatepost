#Gatepost: Bind to Models From SQL

[![npm i gatepost](https://nodei.co/npm/gatepost.png)](https://www.npmjs.com/package/gatepost)

Gatepost allows you define [VeryModel](https://github.com/fritzy/verymodel) models for the purpose of binding to SQL statements.

You can write queries where the results are cast as the model (factory methods) or where the model instance is used as input.

```javascript
"use strict";
let gatepost = require('gatepost');
let joi = require('joi');
let SQL = require('sql-template-strings');

gatepost.setConnection('postgres://fritzy@localhost/fritzy');

let Book = new gatepost.Model({
    id: {type: 'integer', primary: true},
    title: {validate: joi.string().max(100).min(4)},
    author: {validate: joi.number().integer()}
}, {
    name: 'book',
    cache: true
});

let Author = new gatepost.Model({
    id: {type: 'integer', primary: true},
    name: {type: 'string'},
    books: {collection: Book}
}, {
    name: 'author',
    cache: true
});

Author.fromSQL({
    name: "all",
    sql: `select id, name,
(
   SELECT
   json_agg(row_to_json(book_rows))
   FROM (select id, title from books2 WHERE books2.author_id=authors2.id) book_rows
 )
 AS books
 FROM authors2`
});

Author.fromSQL({
    name: 'update',
    instance: true,
    oneResult: true,
    sql: (args, model) => SQL`UPDATE books2 SET title=${model.title} WHERE id=${model.id}`
});

client.connect(function () {
    Author.getAll(function (err, authors) {
        console.log(authors[0].toJSON());
        client.end();
        authors[0].books[0].title = 'Happy Fun Times: The End';
        authors[0].books[0].update(function (err) {
            //...
        });
    });
});
```

```javascript
{ name: 'Nathan Fritz',
  books:
    [ { title: 'Happy Fun Times' },
    { title: 'Derpin with the Stars' } ] }
```

# Knex and others

You don't have to write your SQL by hand. You could, for example, use Knex to generate your postgres flavored SQL.

```javascript
let knex = require('knex')({dialect: 'pg'});
let sqlString = knex.select('id', 'title').from('books2').whereRaw('id = $id').toString();
```

# Model extensions

See [VeryModel documentation](https://github.com/fritzy/verymodel) for information on using `gatepost.Model`s.

__Model options__:

 * name: [string] used for naming the model
 * cache: [boolean] to refer to the model by string

## Functions

### fromSQL

Generate a Factory or Instance method from SQL for your Model

__Options:__

 * `name`: [string] method name
 * `sql`: [string or function]
 * `oneResult`: [boolean] only get one model intance or null rather than array
 * `instance`: [boolean] Add the method to model instances rather than the factory.
 * `model`: [Model or string] cast the results into this model


 __generated function signature__

`function (args, callback);`

`args` is optional and passed as the first argument to the `sql` function.

`callback` [function] optional

#### Callback Function

`function (postgresError, results);`

The results are an array of model instances, or a single model if `oneResult` was set to true (null if no results).

#### Returned Promise

Calling a method generated from `fromSQL` returns a [Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise) which will `then` with the `results` (same as callback results) or `catch` with a Postgres error from [pg](https://npmjs.org/package/pg).


#### SQL Function

 * `args`: [object] arguments passed as the first option
 * `model`: [Model] for instances, the model instance that the function is called to


 #### Examples

### setConnection

 Configure the `pg` postgres client with gatepost to use for queries. Accepts anything valid in the first parameter of [pg.connect](https://github.com/brianc/node-postgres/wiki/pg#parameters).
