"use strict";

let GatePost = require('./');
let pg = require('pg');
let client = 'postgres://fritzy@localhost/fritzy';
let knex = require('knex')({dialect: 'pg'});

GatePost.setConnection(client);

let Book = new GatePost.Model({
    title: {type: 'string'},
    id: {type: 'integer'},
});

let Author = new GatePost.Model({
    name: {type: 'string'},
    books: {collection: Book}
});

Author.registerFactorySQL({
    name: 'getAll',
    sql: () => `SELECT id, name,
(SELECT
 json_agg(row_to_json(book_rows))
 FROM (select id, title from books2 WHERE books2.author_id=authors2.id) book_rows
)
AS books
FROM authors2`
});


Author.getAll(function (err, authors) {
  console.log(authors[0].toJSON());
});

Book.fromSQL({
    name: 'getAll',
    sql: (args) => knex.select('id', 'title').from('books2').orderBy(args.arg),
    oneArg: true,
});

Book.getAll('title')
.then((results) => {
    results.forEach((result) => console.log(result.toJSON()));
})
.catch((error) => console.log(`error: ${error}`))
.then(() => {
  pg.end()
});
