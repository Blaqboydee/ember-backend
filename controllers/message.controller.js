const { Message, Chat, User } = require("../models");

// Create a message
async function createMessage(req, res) {
  try {
    const { content, senderId, chatId } = req.body;

    // Make sure sender and chat exist
    const sender = await User.findById(senderId);
    const chat = await Chat.findById(chatId);
    if (!sender || !chat) {
      return res.status(404).json({ error: "Sender or Chat not found" });
    }

    const message = await Message.create({
      content,
      senderId,
      chatId,
    });

    // Add message to chat's messages array
    chat.messages.push(message._id);
    await chat.save();

    // Populate senderId and chatId before sending
    await message.populate("senderId chatId");

    res.json(message);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

// Get all messages or by chat
async function getMessages(req, res) {
  try {
    const { chatId } = req.query;

    let messages;
    if (chatId) {
      messages = await Message.find({ chatId })
        .populate("senderId", "name email avatar")
        .populate({ path: "replyTo", select: "content senderId isAnonymous anonymousAlias", populate: { path: "senderId", select: "name avatar" } })
        .populate("mentions", "name avatar")
        .sort({ createdAt: 1 }) 
        .exec();
    } else {
      messages = await Message.find()
        .populate("senderId", "name email avatar")
        .populate({ path: "replyTo", select: "content senderId isAnonymous anonymousAlias", populate: { path: "senderId", select: "name avatar" } })
        .populate("mentions", "name avatar")
        .sort({ createdAt: 1 })
        .exec();
    }

    res.json(messages);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

async function getAllMessages(req, res) {
  try {
    const allMessages = await Message.find();
    
    res.status(200).json({
      success: true,
      count: allMessages.length,
      data: allMessages
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    
    res.status(500).json({
      success: false,
      message: 'Server error while fetching messages',
      error: error.message
    });
  }
}

async function deleteMessage(req, res){
  // console.log(req.body);
  
   try {
    const { messageId } = req.params;
    const { userId } = req.body;
    


    // Find and delete only if message belongs to the user
    const message = await Message.findOneAndDelete({ 
      _id: messageId,
       senderId: userId,
    });
    //  if (message) {
    //   // console.log(message);
      
    //  }

  

    if (!message) {
      return res.status(404).json({ error: "Message not found or not authorized" });
    }

    res.json({ success: true, data: message });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

async function editMessage(req, res) {
  try {
    const { messageId } = req.params;       // message ID
    const { userId, content } = req.body;  // new content + who’s editing

    // Find and update only if message belongs to the user
    const message = await Message.findOneAndUpdate(
      { _id: messageId, senderId: userId },  // notice: senderId not sender
      { content },
      { new: true }                   // return updated doc
    ).populate("senderId", "name email avatar");

    if (!message) {
      return res.status(404).json({ error: "Message not found or not authorized" });
    }

    res.json({ success: true, data: message });
  } catch (err) {
    console.error("Edit error:", err);
    res.status(500).json({ error: "Server error" });
  }
}




module.exports = { 
  createMessage, 
  getMessages, 
  getAllMessages,
  deleteMessage,
  editMessage
};