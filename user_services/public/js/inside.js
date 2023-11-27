const socket = Symbol("socket");
class Socket{
  #socket;
  #roomList;
  #mymessagebox;
  #addButton;
  #content;
  #messageForm;
  #messageInput;
  #room;
  #messageOffset;
  #messageLoading;
  #roomDate;
  #roomElement;
  #imageInput;
  #imageContainer;
  #fileIdentifier;
  #compressedChunks;
  constructor(userID, userName){
    if(Socket.instance){
      throw new Error("Cannot create multiple instances of Socket.");
    }
    this.userName = userName;
    this.userID = parseInt(userID);
    this.#socket = io({path:'/message-socket/'});
    this.#roomList = document.querySelector('.left-menu ul');
    this.#mymessagebox = document.querySelector('#message-container');
    this.#addButton = document.querySelector('.addButton');
    this.#content = document.querySelector('.content');
    this.#messageForm = document.getElementById('send-container');
    this.#messageInput = document.getElementById('message-input');
    this.#room = null;
    this.#roomDate = null;
    this.#messageOffset= null;
    this.#messageLoading = true;
    this.#roomElement = {};
    this.#fileIdentifier = {};
    this.#compressedChunks = {};
    this.#messageSockets();
    this.#roomCreated();
    this.#AddNewRoom();
    this.#socketInit();
  }

  #socketInit(){
    fetch('/message/get-rooms', {
      method: 'POST',
      headers: {
        'Content-Type' : 'application/json',
      },
      body: JSON.stringify({user:this.userID})
    })
    .then(response => response.json())
    .then(data => {
      if(!data.error){
        this.#initRooms(data.rooms);
      }else{
        console.log(data.message)
      }
    })
  }

  #initRooms(rooms){
    rooms.forEach(room => {
      let linkRoom = document.createElement('li');
      let anchorTag = document.createElement('a');
      linkRoom.append(anchorTag);
      this.#roomList.append(linkRoom);
      anchorTag.href = `/${room.roomName}`
      anchorTag.textContent = room.roomName;
      linkRoom.addEventListener('click', (event) => {
        this.#messageLoading = true;
        event.preventDefault();
        fetch('/message/join-room', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({room: room.roomID, user: this.userID, existing: true})
        })
        .then(response => response.json())
        .then(data => {
          if(!data.error){
            console.log(data.data)
            this.#joinSocket(data.data, room.roomID)
          }else{
            console.log(data.message)
          }
        })
      })
    })
  }
  #addFile(event) {
    const file = event.target.files[0];  
    if (file) {
      const fileSizeInBytes = file.size;
      const fileSizeInMB = fileSizeInBytes / (1024 * 1024); // Convert to MB
      if (fileSizeInMB > 100) {
        return
      }
      const reader = new FileReader();
      const codeExtensions = ['txt', 'js', 'css', 'html', 'py', 'java', 'cpp', 'c', 'php', 'ruby', 'go', 'swift', 'rust'];
      const imageExtensions = ['jpg', 'jpeg', 'png', 'gif'];
  
      const getFileExtension = () => {
        return new Promise((resolve, reject) => {
          const fileName = file.name.toLowerCase();
          const fileExtension = fileName.split('.').pop().toLowerCase();
          resolve(fileExtension);
        });
      };
  
      getFileExtension()
        .then((fileExtension) => {
          let fileType;
          const uniqueIdentifier = this.#uniqueIdentifier();
          if (file.type.startsWith('text/') || codeExtensions.includes(fileExtension)) {
            reader.onload = (e) => {
              const textContent = e.target.result;
              fileType = 'code';
              const compressedChunks = this.#chunkAndCompress(textContent, fileType, uniqueIdentifier);
              this.#streamSending(compressedChunks)
            };
            reader.readAsText(file);
          } else if (file.type.startsWith('image/')) {
            reader.onload = (e) => {
              const binaryData = new Uint8Array(e.target.result);
              fileType = 'image';
              const compressedChunks = this.#chunkAndCompress(binaryData, fileType, uniqueIdentifier);
              this.#streamSending(compressedChunks)
            };
            reader.readAsArrayBuffer(file);
          } else if (fileExtension === 'docx') {
            reader.onload = (e) => {
              const binaryData = new Uint8Array(e.target.result);
              fileType = 'docx';
              const compressedChunks = this.#chunkAndCompress(binaryData, fileType, uniqueIdentifier);
              this.#streamSending(compressedChunks)
            };
            reader.readAsArrayBuffer(file);
          }else {
            fileType = 'unknown';
            console.log('Unsupported file type.');
          }
        })
        .catch((error) => {
          console.error('Error reading file extension:', error);
        });
    }
    event.target.value = null;
  }
  #chunkAndCompress(data, contentType, identifier){
    const chunks = [];
    const chunkSize = 1000000;
    const totalChunks =  Math.ceil(data.length/chunkSize);
    for(let i = 0; i < totalChunks; i++){
      const start = i * chunkSize;
      const end = (i + 1) * chunkSize;
      const chunkData = data.slice(start, end);
      const compressedChunks = pako.gzip(chunkData, {to: 'string'})
      const chunkObject = {
        data: compressedChunks,
        sequenceNumber: i,
        chunkIdentifier: identifier,
        contentType: contentType,
        chunksLength: totalChunks
      };
      chunks.push(chunkObject);
    }
    return chunks;
  }
  async #streamSending(chunks){
    let length = chunks.length
    for(let i = 0; i < length; i++){
      this.#socket.emit('streamChunk', chunks[i], this.#room)
    }
  }
  #uniqueIdentifier(){
    const randomValue = Math.floor(Math.random() * 100000);
    const timestamp = Date.now();
    const uniqueIdentifier = `${randomValue}_${timestamp}`;
    return uniqueIdentifier;
  }

  #AddNewRoom(){
    this.#addButton.addEventListener('click', () => {
      const roomName = prompt('Enter the room name:');
      if(roomName.length !== 0){
        fetch('/message/create-room', {
          method: 'POST',
          headers: {
            'Content-Type' : 'application/json'
          },
          body: JSON.stringify({ room: roomName })
        })
        .then(response => response.json())
        .then(data => {
          if(data.success){
            console.log(data.message);
          }else{
            console.log(data.message)
          }
        })
        .catch(error => {
          console.log('Error creating room:', error);
        });
      }
    })
  }
  #joinSocket(messages, roomID){
    this.#createContent(messages);
    if(this.#messageForm !== null){
      this.#appendMessage('You joined', 0)
      this.#socket.emit('new-user', roomID, this.userName)
      this.#room = roomID;
      this.#messageLoading = false;
      this.#messageForm.removeEventListener('click', (e) => this.#joinEvent(e));
      this.#messageForm.addEventListener('click', (e) => this.#joinEvent(e));
    }
  }
  #joinEvent(e){
    e.preventDefault()
    const message = this.#messageInput.value.trim();
    if(message.length <= 0 || message == ''){
      return
    }
    this.#appendMessage(message, 0)
    const {messageDate, messageTime} = this.#dateTime();
    const isNew = (messageDate != this.#roomDate) ? true : false;
    this.#socket.emit('send-chat-message', this.#room, this.userID, this.userName, message, messageDate, messageTime, isNew);
    this.#roomDate = messageDate;
    this.#messageInput.value = ''
  }

  #roomCreated(){
    this.#socket.on('disconnected', (message) => {
    })
    this.#socket.on('update-file', (fileID, data) => {
      let file = this.#fileIdentifier[fileID];
      let currentContent = file.textContent;
      for (const update of data) {
        const { newString, start, end } = update;
        currentContent = currentContent.slice(0, start) + newString + currentContent.slice(end);
      }
      this.#fileIdentifier[fileID].textContent = currentContent;
    })
    this.#socket.on('serverChunk', (chunk) => {
      if(!this.#compressedChunks[chunk.chunkIdentifier]){
        this.#compressedChunks[chunk.chunkIdentifier] = new Map();
      }
      this.#compressedChunks[chunk.chunkIdentifier].set(chunk.sequenceNumber, chunk.data);
      if(this.#compressedChunks[chunk.chunkIdentifier].size == chunk.chunksLength){
        let concatenatedArray;
        if(chunk.contentType == 'code'){
          console.log(this.#compressedChunks[chunk.chunkIdentifier])
          const decompressedArray = Array.from(this.#compressedChunks[chunk.chunkIdentifier].values()).map((chunk) =>  {return pako.ungzip(chunk, {to: 'string'})});
          console.log(decompressedArray)
          concatenatedArray = (decompressedArray).join('');
        }else{
          concatenatedArray = Array.from(this.#compressedChunks[chunk.chunkIdentifier].values()).map((chunk) => {return pako.ungzip(chunk, {to: 'uint8array'})});
        }
        this.#creatingElement(concatenatedArray, (chunk.contentType == 'image')? 1:0, chunk.chunkIdentifier)
      }
    })
    this.#socket.on('room-created', (room, roomID) => {
      let li = document.createElement('li');
      let roomLink = document.createElement('a');
      this.#roomList.appendChild(li);
      roomLink.href = `/${room}`;
      roomLink.textContent = room;
      li.appendChild(roomLink);
      this.#roomElement[room] = li;
      let existing = false;
      li.addEventListener('click', (event) => {
        this.#messageLoading = true;
        event.preventDefault();
        fetch('/message/join-room', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({room: roomID, user:this.userID, existing})
        })
        .then(response => response.json())
        .then(data => {
          if(!data.error){
            console.log(data.data)
            this.#joinSocket(data.data, roomID)
          }else{
            console.log(data.message)
          }
        })
        existing = true;
      })
    })
  }
  #dateTime() {
    const currentDateTime = new Date();
    const currentHour = currentDateTime.getHours();
    const currentMinute = currentDateTime.getMinutes();
    const currentTimeInMinutes = currentHour * 60 + currentMinute;
    const formattedDate = parseInt(
        `${(currentDateTime.getMonth() + 1).toString().padStart(2, '0')}${currentDateTime.getDate().toString().padStart(2, '0')}${currentDateTime.getFullYear().toString().slice(-2)}`,
        10
    );
    const intervals = [
        [0, 5 * 60 + 59, 'message1'],
        [6 * 60, 11 * 60 + 59, 'message2'],
        [12 * 60, 17 * 60 + 59, 'message3'],
        [18 * 60, 23 * 60 + 59, 'message4']
    ];
    const matchingInterval = intervals.find(interval =>
        currentTimeInMinutes >= interval[0] && currentTimeInMinutes <= interval[1]
    );
    const time = matchingInterval ? matchingInterval[2] : '';

    return { messageDate: formattedDate, messageTime: time };
  }
  #creatingElement(array, isImage, fileIdentifier){
    if(isImage){
      const concatenatedArray = new Uint8Array(array.reduce((acc, chunk) => [...acc, ...chunk], []));

      const blob = new Blob([concatenatedArray], { type: 'application/octet-stream' });
      const imageUrl = URL.createObjectURL(blob);
      
      const imageElement = document.createElement('img');
      imageElement.src = imageUrl;
          imageElement.addEventListener('load', (e) => {
            const renderedWidth = e.target.width;
            const imagecontainer = document.createElement('div');
            imagecontainer.className = 'text-container';
            const imageHeader = document.createElement('div');
            imageHeader.className = 'file-header';
            const imageBody = document.createElement('div');
            imageBody.className = 'file-body image-body';
            imageElement.style.width = (this.#imageContainer.clientWidth -40)+'px';
            imageBody.append(imageElement);
            imagecontainer.append(imageHeader);
            imagecontainer.append(imageBody);
            this.#imageContainer.appendChild(imagecontainer);
            const saveImage = document.createElement('button');
            saveImage.innerHTML = 'Save';
            saveImage.className = 'imageSave';
            imageHeader.append(saveImage);
            saveImage.addEventListener('click', () => {
              const downloadLink = document.createElement('a');
              downloadLink.href = imageUrl;
              downloadLink.download = 'image.png';
              downloadLink.click();
              downloadLink.remove();
              saveImage.innerHTML = 'Image saved!';
            setTimeout(() => {
              saveImage.innerHTML = 'Save';
            }, 1000);
            });
          });
    }else{
      const preElement = document.createElement('pre');
      preElement.className = 'text-container';
      const backgroundElement = document.createElement('div');
      backgroundElement.className = 'pre-wrapper';
      preElement.append(backgroundElement);
      const codeHeader = document.createElement('div');
      codeHeader.className = 'file-header';
      const codeBody = document.createElement('div');
      codeBody.className = 'file-body code-body';
      backgroundElement.append(codeHeader);
      backgroundElement.append(codeBody);
      const codeElement = document.createElement('code');
      this.#fileIdentifier[fileIdentifier] = codeElement;
      codeElement.textContent = array;
      codeElement.style.outline = 'none';
      codeBody.append(codeElement);
      this.#imageContainer.appendChild(preElement);
      const editButton = document.createElement('button');
      editButton.className = 'codeEdit';
      const copyImage = document.createElement('button');
      copyImage.className = 'codeCopy';
      copyImage.innerHTML = 'Copy';
      editButton.innerHTML = 'Edit';
      codeHeader.append(copyImage);
      codeHeader.append(editButton);
      let edit = false;
      let previousCode;
      let changesArray = [];
      let undoRedo = {};
      let handleCut;
      let handleKeyDown;
      let handlePaste;
      let currentEnd;
      let handleEvent;
      editButton.addEventListener('click', (event) => {
        if(edit){
          edit = false;
          editButton.innerHTML = 'Edit';
          codeElement.contentEditable = false;
          if(previousCode != codeElement.textContent){
            [array] = this.#spliceNewOld(changesArray,null, undoRedo);
            this.#socket.emit('file-update',this.#room, fileIdentifier, array);
          }
          changesArray = [];
          codeElement.removeEventListener('mouseup',handleEvent);
          codeElement.removeEventListener('keyup',handleEvent);
          codeElement.removeEventListener('paste',handlePaste);
          codeElement.removeEventListener('cut',handleCut);
          codeElement.removeEventListener('keydown',handleKeyDown);
        }else{
          let backspace = true;
          let object;
          previousCode = codeElement.textContent;
          edit = true;
          editButton.innerHTML = 'Save edit';
          codeElement.contentEditable = true;
          codeBody.classList.add('hover-text');
          undoRedo = {post:-1,isNew: true};
          handleKeyDown = (event) => {
            const key = event.key;
            const selection = window.getSelection();
            const first = selection.anchorOffset;
            const second = selection.focusOffset
            let start = (first < second) ? first : second;
            let end = (first < second) ? second : first;

            if(key.length === 1){
              //undo
              if(((event.ctrlKey) && (event.key === 'z')) && !event.shiftKey) {
                if(undoRedo.isNew){
                  undoRedo.isNew = false;
                }else{
                  undoRedo.post = (undoRedo.post == 0) ? 0 : undoRedo.post - 1;
                }//redo
                currentEnd = -1;
              } else if (((event.ctrlKey) && (event.key === 'y')) && !event.shiftKey) {
                if(!undoRedo.isNew){
                  undoRedo.isNew = true;
                }else{
                  undoRedo.post = (undoRedo.post == changesArray.length-1) ? changesArray.length-1: undoRedo.post + 1;
                }
                currentEnd = -1;
              } else if(event.ctrlKey){
                //ctrl keys endpoint
              }else{

                if(start !== end || end !== currentEnd){
                  object = {start: start, end: end, oldString: codeElement.textContent.substring(start, end), newString: key};
                  [changesArray, object, undoRedo.post] = this.#spliceNewOld(changesArray, object, undoRedo);
                  currentEnd = end + 1;
                }else{
                  object.newString += key;
                  currentEnd++;
                }
                backspace = true;
              }
            }
            if(event.key === 'Enter'){
              event.preventDefault();
              document.execCommand('insertHTML', false, '\n');
              object = {start, end, oldString: codeElement.textContent.substring(start, end), newString: '\n'};
              [changesArray, object, undoRedo.post] = this.#spliceNewOld(changesArray, object, undoRedo);
              currentEnd = -1;
            }else if(event.key === 'Backspace'){
              if(start == 0){return}
              if(start !== end || start !== currentEnd){
                start = (end == start) ? start - 1 : start;
                object = {start: start, end: end, oldString: codeElement.textContent.substring(start, end), newString: ''};
                [changesArray, object, undoRedo.post] = this.#spliceNewOld(changesArray, object, undoRedo);
                currentEnd = start;
                backspace = false;
              }else{
                if(backspace){
                  object = {start: start-1, end: end, oldString: codeElement.textContent.substring(start-1, end), newString: ''};
                  [changesArray, object, undoRedo.post] = this.#spliceNewOld(changesArray, object, undoRedo);
                  backspace = false;
                  currentEnd--;
                  object.start = start;
                }else{
                  object.start = start-1;
                  currentEnd--;
                  object.oldString = codeElement.textContent.substring(start-1, end) + object.oldString;
                }
              }
            }
          }
          handlePaste = (event) => {
            event.preventDefault();
            const selection = window.getSelection();
            const first = selection.anchorOffset;
            const second = selection.focusOffset
            let start = (first < second) ? first : second;
            let end = (first < second) ? second : first;
            if(codeElement.textContent.substring(start, end) == event.clipboardData.getData("text/plain")){
              return
            }
            const clipboardData = event.clipboardData || window.clipboardData;
            const pastedText = clipboardData.getData('text/plain');
            const formattedText = pastedText.split('\r\n');
            for(let i of formattedText){
              if(currentEnd == start){
                object.newString += i;
              }else{
                object = {start: start, end: end, oldString: codeElement.textContent.substring(start, end), newString: i};
                [changesArray, object, undoRedo.post] = this.#spliceNewOld(changesArray, object, undoRedo);
              }
              document.execCommand('insertText', false, i);
              document.execCommand('insertHTML', false, '\n');
              start += i.length;
              end += i.length;
              object = {start: start, end: end, oldString: codeElement.textContent.substring(start, end), newString: '\n'};
              [changesArray, object, undoRedo.post] = this.#spliceNewOld(changesArray, object, undoRedo);
              start += 1;
              end += 1;
              currentEnd = -1;
            }
          }
          handleCut = () => {
            const selection = window.getSelection();
            const first = selection.anchorOffset;
            const second = selection.focusOffset
            const start = (first < second) ? first : second;
            const end = (first < second) ? second : first;
            if(codeElement.textContent.substring(start, end) == ''){
              return
            }
            object = {start, end, oldString: codeElement.textContent.substring(start, end), newString: ''};
            [changesArray, object, undoRedo.post] = this.#spliceNewOld(changesArray, object, undoRedo);
            currentEnd = -1;
          }
          handleEvent = (event) => {
            const selection = window.getSelection();
            const selectionStart = selection.anchorOffset;
            if(event.type === 'mouseup'){
              if(selectionStart != currentEnd){
                currentEnd = -1;
              }
            }else{
              if(event.key.startsWith('Arrow')){
                currentEnd = -1;
              }
            }
          }        
          codeElement.addEventListener('keydown', handleKeyDown);
          codeElement.addEventListener('paste', handlePaste);
          codeElement.addEventListener('cut', handleCut);
          codeElement.addEventListener('mouseup', handleEvent);
          codeElement.addEventListener('keyup', handleEvent);
        }
      })
      copyImage.addEventListener('click', (event) => {
        const textArea = document.createElement('textarea');
        textArea.value = codeElement.textContent;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        copyImage.innerHTML = 'Text copied!';
        setTimeout(() => {
          copyImage.innerHTML = 'Copy';
        }, 1000);
      })
    }
    
  }
  #spliceNewOld(changesArray, object, undoRedo){
    if(undoRedo.isNew){
      changesArray.splice(undoRedo.post+1);
    }else{
      changesArray.splice(undoRedo.post);
    }
    if(object){
      changesArray.push(object);
    }
    undoRedo.post = changesArray.length -1;
    undoRedo.isNew = true;
    return [changesArray, object, undoRedo.post];
  }
  #messageSockets(){
    this.#socket.on('chat-message', data => {
      this.#appendMessage(`${data.name}: ${data.message}`, 1);
    })

    this.#socket.on('user-connected', name => {
      this.#appendMessage(`${name} connected`, 1);
    })

    this.#socket.on('user-disconnected', name => {
      this.#appendMessage(`${name} disconnected`, 1);
    })
    
    this.#socket.on('room-deleted', (room) => {
      this.#roomElement[room].remove();
      delete this.#roomElement[room];
    })
  }
  #createContent(messages){
    this.#content.innerHTML = '';
    this.#content.innerHTML = `
      <div class="collab-part">
        <input type="file" id="fileInput">
        <div id="imagecontainer"></div>
      </div>
      <div class="message-part" id="message-part">
        <div id="message-container">
        </div>
        <div id="send-container">
          <textarea id="message-input" placeholder="Type a message..."></textarea>
          <button type="button" id="send-button">Send</button>
        </div>
      </div>
    `;
    this.#imageContainer = document.getElementById('imagecontainer');
    this.#imageInput = document.getElementById('fileInput');
    this.#imageInput.removeEventListener('change', (e) => this.#addFile(e));
    this.#imageInput.addEventListener('change', (e) => this.#addFile(e));
    this.#mymessagebox = document.getElementById('message-container');
    this.#messageForm = document.getElementById('send-button');
    this.#messageInput = document.getElementById('message-input');
    this.#extractMessages(messages);
    this.#mymessagebox.removeEventListener('scroll', (e) => this.#scrollToRequest(e));
    this.#mymessagebox.addEventListener('scroll', (e) => this.#scrollToRequest(e))
    this.#messageInput.removeEventListener('keydown', (e) => this.#messageInputs(e));
    this.#messageInput.addEventListener('keydown', (e) => this.#messageInputs(e))
  }
  //works only 1st joining chat
  #extractMessages(messages){
    this.#roomDate = null;
    this.#messageOffset = null;
    this.#fileIdentifier = {};
    this.#compressedChunks = {};
    if(messages == null){
      return
    }
    for(let i = 0; i < messages.length; i++){
      Object.entries(messages[i]).forEach(([key, value]) => {
        if(key == 'mhID'){
          this.#messageOffset = value
        }else if(key == 'daytime'){
          if(i == 0){
            this.#appendMessage(value,0,true,true)
            this.#roomDate = value;
          }
        }else{
          const parsedMessages = JSON.parse(value);
          parsedMessages.forEach(jsonString => {
            const jsonObjects = JSON.parse(jsonString);
            const user = (this.userID == jsonObjects.userID) ? 0 : 1;
            const messageU = `${(user)? jsonObjects.userName: 'You'}`
            this.#appendMessage(`${messageU}: ${jsonObjects.message}`, user);
          })
        }
      })  
    }
  }
  #appendMessage(message, user, prepend, date){
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', user == 0 ? 'my-message' : 'other-message');
    messageElement.innerHTML = message;
    if(date){
      messageElement.style.backgroundColor ='red'
    }
    if(prepend){
      this.#mymessagebox.prepend(messageElement)
    }else{
      this.#mymessagebox.append(messageElement);
      messageElement.scrollIntoView({ behavior: 'auto', block: 'end' });
    }
  }
  #messageInputs(event){
    const messageInput = event.target;
    const start = messageInput.selectionStart;
    const end = messageInput.selectionEnd;
    if (event.key === 'Enter') {
      if (event.shiftKey) {
        messageInput.value = messageInput.value.substring(0, start) + '\n' + messageInput.value.substring(end);
        messageInput.selectionStart = messageInput.selectionEnd = start + 1;
        event.preventDefault();
      } else {
        event.preventDefault();
        this.#joinEvent(event);
      }
    } else if (event.key === 'Tab') {
      event.preventDefault();
      messageInput.value = messageInput.value.substring(0, start) + '\t' + messageInput.value.substring(end);
      messageInput.selectionStart = messageInput.selectionEnd = start + 1;
    }
  }
  #scrollToRequest(event){
    const container = event.target;
    const currentScrollPosition = container.scrollTop;
    if (currentScrollPosition < this.lastScrollPosition) {
      console.log(this.#messageLoading)
      if((!this.stop) && (!this.#messageLoading) && (container.scrollTop / container.clientHeight <= 0.5 || container.scrollTop === 0)){
        console.log('dwa')
        this.#messageLoading = true;
        fetch('/message/pagination', {
          method: 'POST',
          headers: {
            'Content-Type' : 'application/json',
          },
          body: JSON.stringify({room: this.#room, messageOffset: this.#messageOffset})
        })
        .then(response => response.json())
        .then(data => {
          if(!data.error){
            this.#prependMessages(data.rooms);
            console.log(data.rooms)
          }else{
            console.log(data.message)
          }
          setTimeout(() => {
            this.#messageLoading = false;
          }, 1000);
        })
      }
    }
    this.lastScrollPosition = currentScrollPosition;
  }
 //works everytime scrolling and has data in database
  #prependMessages(messages){
    if(messages.length == 0){
      this.stop = true;
    }
    for(let i = 0; i < messages.length; i++){
      Object.entries(messages[i]).reverse().forEach(([key, value]) => {
        if(key == 'mhID'){
          if(i == messages.length -1){
            this.#messageOffset = value;
          }
        }else if(key == 'daytime'){
          this.#appendMessage(value, 0 , true, true);
        }else{
          const parsedMessages = JSON.parse(value);
          parsedMessages.reverse().forEach(jsonString => {
            const jsonObjects = JSON.parse(jsonString);
            const user = (this.userID == jsonObjects.userID) ? 0 : 1;
            const messageU = `${(user)? jsonObjects.userName: 'You'}`
            this.#appendMessage(`${messageU}: ${jsonObjects.message}`, user, true);
          })
        }
      })  
    }
  }
}
const socket1 = new Socket(userID, userName);
const arrowNav = document.querySelector('.arrow-span');

window.addEventListener('resize', handleResize);
function handleResize(){

    const screenWidth = window.innerWidth;
    
    if(screenWidth <= 768){
        arrowNav.addEventListener('click', arrowNavClickable);
    }else{
        arrowNav.removeEventListener('click', arrowNavClickable);
        const roomList = document.querySelector('#roomList');
        const leftMenu = document.querySelector('.left-menu');
        arrowNav.classList.add('arrow-active');
        roomList.classList.remove('roomList-deactive');
        leftMenu.style.width = '230px'
        leftMenu.style.padding = '20px';
    }
}
handleResize()
function arrowNavClickable(event){
    const arrowSpan = event.target
    const roomList = document.querySelector('#roomList');
    const leftMenu = document.querySelector('.left-menu');

    if(arrowSpan.classList.contains('arrow-active')){
        arrowSpan.classList.remove('arrow-active');
        roomList.classList.add('roomList-deactive');
        leftMenu.style.width = '10px';
        leftMenu.style.padding = '0px';
    }else{
        arrowSpan.classList.add('arrow-active');
        roomList.classList.remove('roomList-deactive');
        leftMenu.style.width = '230px'
        leftMenu.style.padding = '20px';
    }
}