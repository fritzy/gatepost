#Gatepost: Bind to Models From SQL

[![npm i gatepost](https://nodei.co/npm/gatepost.png)](https://www.npmjs.com/package/gatepost)

Gatepost allows you define [VeryModel](https://github.com/fritzy/verymodel) models for the purpose of binding to SQL statements.

You can write queries where the results are cast as the model (factory methods) or where the model instance is used as input.

```javascript
var gatepost = require('gatepost');
var pg = require('pg');
var joi = require('joi');

var client = new pg.Client('postgres://fritzy@localhost/fritzy');
gatepost.registerPG(client);

var Book = new gatepost.Model({
    id: {type: 'integer', primary: true},
    title: {validate: joi.string().max(100).min(4)},
    author: {validate: joi.number().integer()}
}, {
    name: 'book',
    cache: true
});

var Author = new gatepost.Model({
    id: {type: 'integer', primary: true},
    name: {type: 'string'},
    books: {collection: Book}
}, {
    name: 'author',
    cache: true
});

Author.fromSQL({
    name: "all",
    sql: "select id, name, "
    + "("
    +   "SELECT "
    +   "json_agg(row_to_json(book_rows)) "
    +   "from (select id, title from books2 WHERE books2.author_id=authors2.id) book_rows"
    + ")"
    + " AS books "
    + "from authors2;"
);

Author.fromSQL({
    name: 'update',
    instance: true,
    oneResult: true,
    sql: "UPDATE books2 SET title=$title WHERE id=$id"
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
var knex = require('knex')({dialect: 'pg'});
var sqlString = knex.select('id', 'title').from('books2').whereRaw('id = $id').toString();
```

# Model extensions

See [VeryModel documentation](https://github.com/fritzy/verymodel) for information on using `gatepost.Model`s.

Extended definiton: `primary` for indicating primary fields

__Model options__:

 * name: string used for naming the model
 * cache: to refer to the model by string

## Functions

### fromSQL

Generate a Factory or Instance method from SQL for your Model

__options:__

 * name: required, string
 * sql: SQL string of query with $field replacors
 * oneResult: Boolean, if true returns a single model instance in the callback rather than an array of instances
 * oneArg: Boolean, the function takes a parameter rather than an object of parameters with the name $arg
 * instance: Boolean. Add the method to model instances rather than the factory. The instance fields are used as input
 * asJSON: Boolean. If `instance` is `true`, assign the model instance as a json object assigned to the model `name` eg: $book
 * model: verymodel or string, When `instance` is `true`, cast the results into this model rather than the model the function is bound to.

 __generated function signature__
 
`function (args, callback);`

`args` is optional, and sets the arguments to instert into the SQL. For instanced methods, it extends the arguments already supplied by the model.

`callback` is not optional
 
__callback signature__

`function (postgresError, results);`

The results are an array of model instances, or a single model if `oneResult` was set to true (null if no results).
 
### registerPG

 Register the `pg` postgres client with gatepost to use for queries.
