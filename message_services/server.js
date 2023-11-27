const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const Redis = require('ioredis');
const pool = require('./connection/connection.js');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    path: '/message-socket/'
});

app.use(express.json());
app.use(express.urlencoded({extended: true}))

app.post('/message/send-message', (req, res) => {
    console.log('message send');
    return res.json({data:req.body.data})
})
app.post('/message/click-message', (req, res) => {
    console.log('click message')
})

app.post('/message/provide-my-room', (req, res) => {
    const userID = req.body.userID;
    pool.getConnection((error, connection) => {
      if(err){
        return res.json({error: true, message: 'Server error'})
      }
      connection.query('SELECT DISTINCT rt.roomname, mt.* FROM userroom ur JOIN roomtab rt ON ur.roomID = rt.roomID JOIN messagetab mt ON ur.roomID = mt.roomID WHERE ur.userID = ?', [userID], (err, result) => {
        connection.release();
        if(error){
          res.json({error:true, message:'no room'});
        }else{
          res.json({error:false, data: result})
        }
      })
    })
})
app.post('/message/get-rooms', (req, res) => {
  pool.getConnection((err, connection) => {
    if(err){
      return res.json({error: true, message: 'getting rooms failed'})
    }
    connection.query('SELECT room.roomID, room.roomName FROM userroom uR INNER JOIN roomtab room ON uR.roomID = room.roomID WHERE uR.userID = ?', [req.body.user], (error, result) => {
      connection.release()
      if(error){
        console.log(error)
        return res.json({error: true, message: 'selecting error'})
      }
      res.json({error:false, rooms: result})
    })
  })
})
app.post('/message/join-room', (req, res) => {
    const userID = req.body.user;
    const roomID = req.body.room;  
    pool.getConnection((err, connection) => {
      if(err){
        return res.json({error:true, message: 'database error'})
      }
      const conditionQuery = (req.body.existing) ? 'SELECT roomID from userroom where userID = ? AND roomID = ?' : 'INSERT INTO userroom (userID, roomID) VALUES (?, ?)';
      connection.query(conditionQuery, [userID, roomID], (error, result) => {
        if(error || result.length <= 0){
          connection.release();
          return res.json({error:true, message:'error joining room'})
        }
        const dataSizeQuery = 'SELECT dataSize FROM messagetab where roomID = ? order by mhid desc limit 10'
        connection.query(dataSizeQuery, [roomID], (dataError, dataSizeResults) => {
          if(dataError){
            connection.release();
            return res.json({ error: true, message: 'error retrieving dataSize' });
          }
          let rowCount = 0;
          let totalDataSize = 0;
          const threshold = 800;
          for (const dataSizeRow of dataSizeResults) {
            const dataSize = dataSizeRow.dataSize;
            rowCount++;
            totalDataSize += dataSize;
            if (totalDataSize + dataSize <= threshold) {
  
            } else {
              break;
            }
          }
          connection.query('SELECT mhID, daytime, message1, message2, message3, message4 FROM messagetab where roomID = ? ORDER BY mhid DESC LIMIT ?', [roomID, rowCount], (error2, result2) => {
            connection.release();
            if(error2){
              return res.json({error:true, message:'error selecting room'})
            }
            res.json({error:false, data: result2})
          })
        })
      })
    })
})
app.post('/message/pagination', (req, res) => {
  const mhID = req.body.messageOffset;
  const roomID = req.body.room;
  pool.getConnection((err, connection) => {
    if(err){
      return res.json({error:true, message: 'database error'})
    }
    const dataSizeQuery = 'SELECT dataSize FROM messagetab where roomID = ? AND mhid < ? order by mhid desc limit 10'
    connection.query(dataSizeQuery, [roomID, mhID], (dataError, dataSizeResults) => {
      if(dataError){
        connection.release();
        return res.json({ error: true, message: 'error retrieving dataSize' });
      }
      let rowCount = 0;
      let totalDataSize = 0;
      const threshold = 800;
      for (const dataSizeRow of dataSizeResults) {
        const dataSize = dataSizeRow.dataSize;
        rowCount++;
        totalDataSize += dataSize;
        if (totalDataSize + dataSize <= threshold) {
        } else {
          break;
        }
      }
      connection.query('SELECT mhID, daytime, message1, message2, message3, message4 FROM messagetab where roomID = ? AND mhid < ? ORDER BY mhid DESC LIMIT ?', [roomID, mhID, rowCount], (error2, result2) => {
        connection.release();
        if(error2){
          return res.json({error:true, message:'error selecting room'})
        }
        res.json({error:false, rooms: result2})
      })
    })
  })
})
app.post('/message/create-room', (req, res) => {
    pool.getConnection((err, connection) => {
      if(err){
        return res.json({error:true, message: 'Connection error'});
      }
      connection.query('INSERT INTO roomtab(roomName) VALUES (?)', [req.body.room], (error,result) => {
        connection.release();
        if(error || result.length <= 0){
          res.json({error:true, message:'roomtab error'})
        }else{
          res.json({error: false, message: 'Room successfully created'})
          io.emit('room-created', req.body.room, result.insertId);
        }
      })
    })
});

// REDIS PUB/SUB

const redisSubscriber = new Redis({
    host: 'messageRedis',
    port: 6379,
});

const redisPublisher = new Redis({
    host: 'messageRedis',
    port: 6379,
});

redisSubscriber.on('error', (err) => {
    console.error('Redis Publisher Error:', err);
});

redisPublisher.on('error', (err) => {
    console.error('Redis Publisher Error:', err);
});

function redisPublish(channel, messages){
    console.log(messages+'pub')
    redisPublisher.publish(channel, messages);
}

redisSubscriber.subscribe('new-user', 'serverChunk', 'serverEnd', 'update-file', 'chat-message', 'disconnect');

redisSubscriber.on('message', (channel,message) => {
    const redisMessage = JSON.parse(message);
    if(message.room){
      console.log('sub pub room')
      console.log(message)
      console.log(channel)
      io.socket.to(message.room).emit(channel, redisMessage);
    }else{
      console.log('sub pub no room')
      console.log(message)
      console.log(channel)
      io.socket.emit(channel, redisMessage);
    }
})

io.on('connection', (socket) => {
    io.emit('message-connected', 'message connected')
    socket.on('new-user', (room, username) => {
        socket.join(room);
        socket.to(room).emit('user-connected', username);
        let socketMessage = JSON.stringify({room, username});
        redisPublish('new-user', socketMessage);
    })
    socket.on('streamChunk', (chunk, room) => {
        io.to(room).emit('serverChunk', chunk);
        let socketMessage = JSON.stringify({room, chunk});
        redisPublish('serverChunk', socketMessage);
      }); 
    socket.on('streamEnd', (chunk, room) => {
        io.to(room).emit('serverEnd', chunk);
        let socketMessage = JSON.stringify({room, chunk});
        redisPublish('serverEnd', socketMessage);
    })
    socket.on('file-update', (room, fileID, data) => {
        socket.to(room).emit('update-file', fileID, data);
        let socketMessage = JSON.stringify({room, fileID, data});
        redisPublish('update-file', socketMessage);
    })
    socket.on('send-chat-message', (room, userID, name, message, date, timeColumn, newRow) => {
        socket.to(room).emit('chat-message', { message, name }, () => {
            pool.getConnection((err, connection) => {
                if(err){  
                    console.log(err)
                    return
                }
                if(newRow){
                    connection.query('INSERT INTO messagetab(roomID, daytime, message1, message2, message3, message4) VALUES (?, ?, JSON_ARRAY(), JSON_ARRAY(), JSON_ARRAY(), JSON_ARRAY())', [room, date], (error, result) => {
                        if(error.code === 'ER_DUP_ENTRY'){
                            if(error){
                                console.log('message created');
                            }else{
                                console.log(error);
                                connection.release();
                                return
                            }
                        }
                    })
                }
                const newMessageData = JSON.stringify({userID:userID, message: message, userName: name})
                const dataSize = Buffer.byteLength(newMessageData);
                connection.query(`update messagetab set datasize = datasize + ?,${timeColumn} = JSON_ARRAY_APPEND(${timeColumn}, '$', ?) where roomID = ?`, [dataSize, newMessageData, room], (error2, result) => {
                    connection.release();
                    if(error2){
                        console.log(error2)
                        return
                    }
                    console.log('done')
                })
            })
        
        })
        let socketMessage = JSON.stringify({message, name});
        redisPublish('chat-message', socketMessage);
    })
    socket.on('disconnect', (user) => {
        redisSubscriber.quit();
    })
})
server.listen(4000, () => {
    console.log(`server listen to 4000`)
})