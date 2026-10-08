// Lecture 6 example: two friends and a book (after Robinson, Webber and Eifrem, Graph Databases).
MATCH (n) DETACH DELETE n;

CREATE
  (john:Person {name: 'John', age: 27}),
  (sally:Person {name: 'Sally', age: 32}),
  (book:Book {title: 'Graph Databases', authors: ['Ian Robinson', 'Jim Webber']}),
  (john)-[:FRIEND_OF {since: '2013-09-01'}]->(sally),
  (sally)-[:FRIEND_OF {since: '2013-09-01'}]->(john),
  (john)-[:HAS_READ {on: '2013-03-02', rating: 5}]->(book),
  (sally)-[:HAS_READ {on: '2013-09-02', rating: 4}]->(book);
