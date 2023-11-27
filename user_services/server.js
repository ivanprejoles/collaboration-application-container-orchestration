const express = require('express');
const app = express();
const pool = require('./connection/connection.js');

app.set('views', './view');
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({extended: true}));

app.get('/', (req, res ) => {
    res.render('login')
})
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    pool.getConnection((err, connection) => {
      if(err){
        return res.json({error: true, message: 'Login failed.'})
      }
      connection.query('SELECT userid,username FROM usertab where username = ? AND password = ?', [username, password], (err, result) => {
        connection.release();
        if(err || result.length <= 0){
          res.json({error: true, message: 'Login failed'})
        }else{
          res.render('inside', {data: result[0]})
        }
      })
    })
})
app.post('/register', (req, res) => {
    const { username, password } = req.body;
    pool.getConnection((err, connection) => {
      if(err){
        return res.json({error: true, message: 'Registration failed.'})
      }
      connection.query('INSERT INTO usertab (username, password) values (?,?)', [username,password,username], (err, result) => {
        connection.release();
        if(err){
          res.json({error:true, message: 'registration failed 2'})
        }else{
          res.json({error:false, message: 'Registered successfully'})
        }
      })
    })
});

app.listen(3000, () => {
    console.log(`server listen to 3000`)
})