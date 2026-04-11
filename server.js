
const mongoose = require('mongoose');
const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const http = require("http");
const { Server } = require("socket.io");
const connect = require("./db");
const { Message, User } = require("./models");

// Routes
const userRoutes = require("./routes/user.routes");
const chatRoutes = require("./routes/chat.routes");
const messageRoutes = require("./routes/message.routes");
const authRoutes = require("./routes/auth.routes");
const friendRoutes = require("./routes/friends.routes");
const friendRequestsRoutes = require("./routes/friendRequests.routes");

const app = express();
const server = http.createServer(app);

// Allowed origins
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://172.18.64.1:3000",
  "http://192.168.0.187:5173",
  "https://emberconnect.vercel.app",
];

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
  })
);

app.use(express.json());

// Attach io to every request
let io; // defined later
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Routes
app.use("/users", userRoutes);
app.use("/chats", chatRoutes);
app.use("/messages", messageRoutes);
app.use("/auth", authRoutes);
app.use("/friends", friendRoutes);
app.use("/friendRequests", friendRequestsRoutes);

app.get("/", (req, res) => {
  res.send("ZapTalk API is running...");
});

// Socket.IO setup
io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Track active socket connections per user: userId → Set<socketId>
const onlineUsers = new Map();

io.on("connection", (socket) => {
  // console.log(" User connected:", socket.id);

  // When a user comes online
  socket.on("user-online", async (userId) => {
    try {
      // Track this socket for the user
      socket.userId = userId;
      if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
      onlineUsers.get(userId).add(socket.id);

      // Join a private room with the userId
      socket.join(userId);

      await User.findByIdAndUpdate(userId, {
        "status.state": "online",
        "status.lastSeen": null,
      });

      io.emit("user-status-updated", {
        userId,
        status: { state: "online", lastSeen: null },
      });

      // console.log(` User ${userId} is online and joined room ${userId}`);
    } catch (err) {
      console.error("Error setting user online:", err);
    }
  });

  // Return which of the given friend IDs are currently online
  socket.on("get_friends_online_status", (friendIds) => {
    if (!Array.isArray(friendIds)) return;
    const result = {};
    friendIds.forEach((id) => {
      result[id] = onlineUsers.has(id) && onlineUsers.get(id).size > 0;
    });
    socket.emit("friends_online_status", result);
  });

  // Join multiple chats
  socket.on("join_chats", (chatIds) => {
    if (!Array.isArray(chatIds)) return;
    chatIds.forEach((chatId) => socket.join(chatId));
  });

  // Join a single chat
  socket.on("join_chat", (chatId) => {
    socket.join(chatId);
    // console.log("Joined chat:", chatId, "socket:", socket.id);
    //   console.log("Sockets in room", chatId, ":", io.sockets.adapter.rooms.get(chatId));
  });


// Message editing
socket.on('editMessage', async (data) => {
  try {
    const { messageId, content, chatId, userId } = data;
    
    // Verify user owns the message (optional security check)
    const message = await Message.findById(messageId);
    if (!message || message.senderId.toString() !== userId) {
      return socket.emit('error', { message: 'Unauthorized' });
    }
    
    // Broadcast to all users in the chat except sender
    socket.to(chatId).emit('messageEdited', {
      messageId,
      content,
      chatId,
      updatedAt: new Date()
    });
    
  } catch (error) {
    console.error('Edit message error:', error);
    socket.emit('error', { message: 'Failed to edit message' });
  }
});




socket.on('deleteMessage', async ({ messageId, chatId, userId }) => {
  const message = await Message.findById(messageId);
  if (!message || message.senderId.toString() !== userId) {
    return socket.emit('error', { message: 'Unauthorized' });
  }

  await Message.findByIdAndDelete(messageId);
  socket.to(chatId).emit('messageDeleted', { messageId, chatId });
  socket.emit('messageDeleted', { messageId, chatId }); // notify sender too
});



// Typing indicators
socket.on('startTyping', async (data) => {
  // console.log(data);
  
  try {
    const { chatId, userId, otherUserId } = data;
    
    // Get user info for display
    const user = await User.findById(userId).select('name');
    
    // Broadcast only to the other user in the chat
    socket.to(chatId).emit('userStartTyping', {
      chatId,
      userId,
      userName: user?.name || 'Someone'
    });
    
  } catch (error) {
    console.error('Start typing error:', error);
  }
});

socket.on('stopTyping', (data) => {
  try {
    const { chatId, userId } = data;
    
    // Broadcast only to the other user in the chat
    socket.to(chatId).emit('userStopTyping', {
      chatId,
      userId
    });
    
  } catch (error) {
    console.error('Stop typing error:', error);
  }
});


  // Send message
  socket.on("send_message", async (data) => {
    if (!data.content || !data.senderId || !data.chatId) return;

    try {
      const message = await Message.create({
        content: data.content,
        senderId: data.senderId,
        chatId: data.chatId,
      });

      await message.populate("senderId", "name email avatar");
      io.to(data.chatId).emit("receive_message", message);
    } catch (err) {
      console.error("Error saving message:", err);
    }
  });

  // Leave chat
  socket.on("leave_chat", (chatId) => {
    socket.leave(chatId);
  });

  // Mark user offline manually
  socket.on("user-offline", async (userId) => {
    console.log("user-offline event received for userId:", userId);
    
    try {
      const lastSeen = new Date();
      await User.findByIdAndUpdate(userId, {
        "status.state": "offline",
        "status.lastSeen": lastSeen,
      });

      io.emit("user-status-updated", {
        userId,
        status: { state: "offline", lastSeen },
      });

      // console.log(` User ${userId} went offline`);
    } catch (err) {
      console.error("Error setting user offline:", err);
    }
  });

  // Disconnect handler - auto-offline when all sessions close
  socket.on("disconnect", async () => {
    const userId = socket.userId;
    if (!userId) return;

    const sockets = onlineUsers.get(userId);
    if (sockets) {
      sockets.delete(socket.id);
      if (sockets.size === 0) {
        onlineUsers.delete(userId);
        try {
          const lastSeen = new Date();
          await User.findByIdAndUpdate(userId, {
            "status.state": "offline",
            "status.lastSeen": lastSeen,
          });
          io.emit("user-status-updated", {
            userId,
            status: { state: "offline", lastSeen },
          });
        } catch (err) {
          console.error("Error setting user offline on disconnect:", err);
        }
      }
    }
  });
});

// Start server
const PORT = process.env.PORT || 5000;
connect().then(() => {
  server.listen(PORT, () =>
    console.log(` Server running on port ${PORT}`)
  );
});
