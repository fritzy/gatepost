var PostGate = require('./');
var pg = require('pg');
var client = new pg.Client('postgres://fritzy@localhost/fritzy');

PostGate.registerPG(client);

var Author = new PostGate.Model({
    name: {type: 'string'},
    books: {collection: {
        title: 'string'
    }}
});

Author.registerFactorySQL('getAll', "select value->>'name' AS name, (select array_agg(value->>'title') AS title from books where authors.id=(value->'author')::text::int) books from authors;");

client.connect(function () {
    Author.getAll(function (err, authors) {
        console.log(err);
        console.log(authors[0].toJSON());
    });
});
