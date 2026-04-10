const { User } = require("../models");

// Send a friend request
async function sendFriendRequest(req, res) {
  // console.log(req.body);
  
  try {
    const { userId, senderName } = req.body;
    const friendId = req.params.id;

    if (userId === friendId) {
      return res.status(400).json({ message: "You cannot add yourself." });
    }

    const user = await User.findById(userId);
    const friend = await User.findById(friendId);

    if (!user || !friend) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.friends.includes(friendId)) {
      return res.status(400).json({ message: "Already friends" });
    }

    if (user.sentFriendRequests.some(r => r.to.toString() === friendId)) {
      return res.status(400).json({ message: "Request already sent" });
    }

    // Save request in both sender and receiver
    user.sentFriendRequests.push({ to: friendId });
    friend.friendRequests.push({ from: userId });

    await user.save();
    await friend.save();

    // IMPORTANT: Get the complete populated request data
    const updatedUser = await User.findById(userId).populate('sentFriendRequests.to');
    const updatedFriend = await User.findById(friendId).populate('friendRequests.from');
    
    // Get the newly added requests with populated data
    const newSentRequest = updatedUser.sentFriendRequests[updatedUser.sentFriendRequests.length - 1];
    const newReceivedRequest = updatedFriend.friendRequests[updatedFriend.friendRequests.length - 1];

    // Emit complete populated data to receiver
    req.io.to(friendId).emit("friend_request_received", {
      _id: newReceivedRequest._id,
      from: {
        _id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar
      },
      createdAt: newReceivedRequest.createdAt
    });

    // Emit to sender for their sent requests list (optional)
    req.io.to(userId).emit("friend_request_sent", {
      _id: newSentRequest._id,
      to: {
        _id: friend._id,
        name: friend.name,
        email: friend.email,
        avatar: friend.avatar
      },
      createdAt: newSentRequest.createdAt
    });

    // console.log(`Friend request event emitted to: ${friendId}, by ${senderName}`);

    res.json({ message: "Friend request sent" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
// Cancel a sent friend request
async function cancelFriendRequest(req, res) { 
  try {
    const { userId } = req.body; // sender
    const friendId = req.params.id; // receiver
    // console.log(userId);
    
    // console.log(friendId);
    
    const user = await User.findById(userId);
    const friend = await User.findById(friendId);

    if (!user || !friend) {
      return res.status(404).json({ message: "User not found" });
    }

    user.sentFriendRequests = user.sentFriendRequests.filter(
      r => r.to.toString() !== friendId
    );

    friend.friendRequests = friend.friendRequests.filter(
      r => r.from.toString() !== userId
    );

    await user.save();
    await friend.save();

     // Notify receiver that request got cancelled
    req.io.to(friendId).emit("friend_request_cancelled", {
      senderId: userId,
    });

    res.json({ message: "Friend request cancelled" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Get incoming requests
async function getFriendRequests(req, res) {
  try {
    const user = await User.findById(req.params.id)
      .populate("friendRequests.from", "name email avatar");

    if (!user) return res.status(404).json({ message: "User not found" });

    res.json(user.friendRequests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Get sent requests
async function getSentRequests(req, res) {

    
  try {
    const user = await User.findById(req.params.id)
      .populate("sentFriendRequests.to", "name email avatar");

    if (!user) return res.status(404).json({ message: "User not found" });

    res.json(user.sentFriendRequests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Accept a request
async function acceptFriendRequest(req, res) {
  try {
    const { userId } = req.body; // receiver
     const {requesterName} = req.body;
    const requesterId = req.params.id;

    const user = await User.findById(userId);
    const requester = await User.findById(requesterId);
    // console.log(user);
    
      
    if (!user || !requester) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.friends.includes(requesterId)) {
      return res.status(400).json({ message: "Already friends" });
    }

    // Add to friends
    user.friends.push(requesterId);
    requester.friends.push(userId);

    // Remove requests
    user.friendRequests = user.friendRequests.filter(
      r => r.from.toString() !== requesterId
    );
    requester.sentFriendRequests = requester.sentFriendRequests.filter(
      r => r.to.toString() !== userId
    );

    await user.save();
    await requester.save();

// Notify the requester (sender) their request was accepted
req.io.to(requesterId).emit("friend_request_accepted", {
  friend: {
    _id: user._id,
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    status: user.status,
  },
});

// Notify the accepter so their own friends list updates via socket too
req.io.to(userId).emit("friend_added", {
  friend: {
    _id: requester._id,
    name: requester.name,
    email: requester.email,
    avatar: requester.avatar,
    status: requester.status,
  },
});



    res.json({ message: "Friend request accepted",
    newFriend: {  _id: requester._id,
    name: requester.name,
    email: requester.email,
    avatar: requester.avatar,
  } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Reject a request
async function rejectFriendRequest(req, res) {
  try {
    const { userId } = req.body; // receiver
    const {requesterName} = req.body;
    const requesterId = req.params.id;

    const user = await User.findById(userId);
    const requester = await User.findById(requesterId);

    if (!user || !requester) {
      return res.status(404).json({ message: "User not found" });
    }

    user.friendRequests = user.friendRequests.filter(
      r => r.from.toString() !== requesterId
    );
    requester.sentFriendRequests = requester.sentFriendRequests.filter(
      r => r.to.toString() !== userId
    );

    await user.save();
    await requester.save();

    // Notify sender that their request was rejected
    req.io.to(requesterId).emit("friend_request_rejected", {
      receiverId: userId,
    });

    res.json({ message: "Friend request rejected" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  sendFriendRequest,
  cancelFriendRequest,
  getFriendRequests,
  getSentRequests,
  acceptFriendRequest,
  rejectFriendRequest,
};
