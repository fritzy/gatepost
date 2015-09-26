"use strict";

let GatePost = require('./');
let pg = require('pg');
let client = 'postgres://fritzy@localhost/fritzy';

GatePost.setConnection(client);

let Author = new GatePost.Model({
    name: {type: 'string'},
    books: {collection: {
        title: 'string'
    }}
});

Author.registerFactorySQL({
    name: 'getAll',
    sql: () => GatePost.SQL`SELECT id, name,
(SELECT
 json_agg(row_to_json(book_rows))
 FROM (select id, title from books2 WHERE books2.author_id=authors2.id) book_rows
)
AS books
FROM authors2`
});

Author.getAll(function (err, authors) {
    console.log(authors[0].toJSON());
    pg.end();
});
