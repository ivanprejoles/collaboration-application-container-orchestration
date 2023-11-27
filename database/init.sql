create database collabdb;
use collabdb;
CREATE TABLE usertab (
  userID bigint NOT NULL AUTO_INCREMENT,
  username varchar(50) NOT NULL,
  password varchar(50) NOT NULL,
  PRIMARY KEY (userID),
  UNIQUE KEY (username)
);

CREATE TABLE roomtab (
  roomID bigint(20) NOT NULL AUTO_INCREMENT,
  roomname varchar(30) NOT NULL,
  PRIMARY KEY (roomID)
);

CREATE TABLE userroom (
  urID bigint NOT NULL AUTO_INCREMENT,
  userID bigint NOT NULL,
  roomID bigint NOT NULL,
  PRIMARY KEY (urID),
  UNIQUE KEY unique_IDs (userID,roomID),
  FOREIGN KEY (userID) REFERENCES usertab (userID),
  FOREIGN KEY (roomID) REFERENCES roomtab (roomID)
);




CREATE TABLE messagetab (
  mhID bigint NOT NULL AUTO_INCREMENT,
  roomID bigint NOT NULL,
  daytime bigint NOT NULL,
  message1 longtext DEFAULT NULL,
  message2 longtext DEFAULT NULL,
  message3 longtext DEFAULT NULL,
  message4 longtext DEFAULT NULL,
  datasize bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (mhID),
  UNIQUE KEY roomDayTime (roomID,daytime),
  FOREIGN KEY (roomID) REFERENCES roomtab (roomID)
);
