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
      .populate("users", "name email avatar status")
      .lean()
      .exec();

    // Attach the last message to each chat
    const { Message } = require("../models");
    const chatIds = chats.map((c) => c._id);
    const lastMessages = await Message.aggregate([
      { $match: { chatId: { $in: chatIds } } },
      { $sort: { createdAt: 1 } },
      { $group: { _id: "$chatId", lastMessage: { $last: "$$ROOT" } } },
    ]);
    const lastMsgMap = {};
    lastMessages.forEach((item) => {
      lastMsgMap[item._id.toString()] = item.lastMessage;
    });

    const result = chats.map((chat) => ({
      ...chat,
      lastMessage: lastMsgMap[chat._id.toString()] || null,
    }));

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}


async function getGroupChats(req, res) {
  try {
    const userId = req.query.userId;
    const { Message } = require("../models");

    const groupChats = await Chat.find({
      isDirect: false,
      users: userId,
    })
      .populate("users", "name avatar status")
      .lean()
      .exec();

    // Attach the last message to each group chat
    const chatIds = groupChats.map((c) => c._id);
    const lastMessages = await Message.aggregate([
      { $match: { chatId: { $in: chatIds } } },
      { $sort: { createdAt: 1 } },
      { $group: { _id: "$chatId", lastMessage: { $last: "$$ROOT" } } },
    ]);

    // Populate senderId on last messages
    const lastMsgMap = {};
    for (const item of lastMessages) {
      const msg = item.lastMessage;
      if (msg.senderId) {
        const sender = await User.findById(msg.senderId).select("name avatar").lean();
        msg.senderId = sender;
      }
      lastMsgMap[item._id.toString()] = msg;
    }

    const result = groupChats.map((chat) => ({
      ...chat,
      lastMessage: lastMsgMap[chat._id.toString()] || null,
    }));

    // Sort by most recent activity
    result.sort((a, b) => {
      const aTime = a.lastMessage?.createdAt || a.updatedAt || a.createdAt;
      const bTime = b.lastMessage?.createdAt || b.updatedAt || b.createdAt;
      return new Date(bTime) - new Date(aTime);
    });

    res.status(200).json(result);
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

