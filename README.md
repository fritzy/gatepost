#PostGate

`npm i --save postgate`

```javascript
var PostGate = require('gatepost');
var pg = require('pg');
var client = new pg.Client('postgres://fritzy@localhost/fritzy');

PostGate.registerPG(client);

var Author = new PostGate.Model({
    name: {type: 'string'},
    books: {collection: {
        title: 'string'
    }}
});

Author.registerFactorySQL('getAll', "select id, name, (select json_agg(row_to_json(book_r)) from (select id, title from books2 WHERE books2.author_id=authors2.id) book_r) AS books from authors2;");

client.connect(function () {
    Author.getAll(function (err, authors) {
        console.log(authors[0].toJSON());
        client.end();
    });
});
```

```javascript
{ name: 'Nathan Fritz',
  books:
    [ { title: 'Happy Fun Times' },
    { title: 'Derpin with the Stars' } ] }
```
