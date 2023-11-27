const mysql = require('mysql2');

const pool = mysql.createPool({
    host: 'mysql',
    user: 'root',
    password: 'CollabDB',
    database: 'collabdb',
    connectionLimit: 10
})

module.exports = pool;