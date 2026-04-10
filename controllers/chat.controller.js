const { Chat } = require("../models");
const { User } = require("../models");

// Create a chat
async function createChat(req, res) {
  try {
    const { name, userIds, isDirect } = req.body; // userIds = array of user IDs

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: "userIds is required and must be an array" });
    }

    // For 1-on-1 chats, check if it already exists
    if (isDirect && userIds.length === 2) {
      const existingChat = await Chat.findOne({
        isDirect: true,
        users: { $all: userIds }, // chat includes both users
      })
        .populate("users")
        .populate({
          path: "messages",
          populate: { path: "senderId", select: "name email" }
        });

      if (existingChat) {
        return res.json(existingChat);
      }
    }

    // Otherwise, create a new chat
    const chat = await Chat.create({
      name: name || null,
      isDirect: isDirect || false,
      users: userIds,
      messages: [],
    });

    // Populate users before sending
    await chat.populate("users");

    res.json(chat);
  } catch (error) {
    console.error("Create chat error:", error);
    res.status(400).json({ error: error.message });
  }
}

// Get all chats or filter by users
// async function getChats(req, res) {
//   try {
//     const { userIds } = req.query;

//     let chats;

//     if (userIds) {
//       const idsArray = userIds.split(",");

//       // Fetch 1-on-1 chats with these two users
//       chats = await Chat.find({
//         isDirect: true,
//         users: { $all: idsArray },
//       })
//         .populate("users")
//         .populate({
//           path: "messages",
//           populate: { path: "senderId", select: "name email" }
//         });

//       // Filter chats with exactly 2 users
//       chats = chats.filter((chat) => chat.users.length === 2);
//     } else {
//       // Fetch all chats
//       chats = await Chat.find()
//         .populate("users")
//         .populate({
//           path: "messages",
//           populate: { path: "senderId", select: "name email" }
//         });
//     }

//     res.json(chats);
//   } catch (error) {
//     console.error("Get chats error:", error);
//     res.status(400).json({ error: error.message });
//   }
// }

// Get all directchats for a particular user
async function getDirectChats(req, res) {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "userId query is required" });
    }

    // Find chats that include this user
    const chats = await Chat.find({ 
      isDirect: true,
      users: userId })
      .populate("users messages") // populate user info and messages
      .exec();

    res.json(chats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}


async function getGroupChats(req, res) {
  try {
    const userId = req.query.userId;
    const groupChats = await Chat.find({
      isDirect: false,
      users: userId,
    })
      .populate("users", "name avatar status")
      .populate("messages");

    res.status(200).json(groupChats);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to load group chats" });
  }
}

// Leave a group chat
async function leaveGroup(req, res) {
  try {
    const { chatId } = req.params;
    const { userId } = req.body;

    if (!userId) return res.status(400).json({ error: "userId is required" });

    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).json({ error: "Group not found" });
    if (chat.isDirect) return res.status(400).json({ error: "Cannot leave a direct chat" });

    chat.users = chat.users.filter((u) => u.toString() !== userId);

    if (chat.users.length === 0) {
      await Chat.findByIdAndDelete(chatId);
    } else {
      await chat.save();
    }

    // Notify remaining members
    req.io.to(chatId).emit("user_left_group", { groupId: chatId, userId });

    res.json({ message: "Left group successfully" });
  } catch (error) {
    console.error("Leave group error:", error);
    res.status(500).json({ error: error.message });
  }
}


// Get all chats (direct + group) for a user
async function getUserChats(req, res) {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: "userId param is required" });
    }

    const chats = await Chat.find({ users: userId })
      .populate("users", "name email") // populate user info
      .populate({
        path: "messages",
        populate: { path: "senderId", select: "name email" },
      });

    res.json(chats);
  } catch (error) {
    console.error("Get user chats error:", error);
    res.status(500).json({ error: error.message });
  }
}

module.exports = { createChat, getDirectChats, getGroupChats, getUserChats, leaveGroup };

