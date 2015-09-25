var PostGate = require('./');
var pg = require('pg');
var client = 'postgres://fritzy@localhost/fritzy';

PostGate.setConnection(client);

var Author = new PostGate.Model({
    name: {type: 'string'},
    books: {collection: {
        title: 'string'
    }}
});

Author.registerFactorySQL({
    name: 'getAll',
    sql: `SELECT id, name,
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
