// backend/controllers/user.controller.js
const mongoose = require("mongoose");
const cloudinary = require("../config/cloudinary");
const { User } = require("../models");
const fs = require("fs");

// Get all users
async function getUsers(req, res) {
  try {
    const users = await User.find({}, { password: 0, __v: 0 });
    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: error.message });
  }
}


// Get logged-in user's profile
async function getProfile(req, res) {
  try {
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(userId))
      return res.status(400).json({ error: "Invalid user ID" });

    const user = await User.findById(userId, { password: 0, __v: 0 });

    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({ message: "Profile fetched successfully", user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
}


// Update logged-in user's profile
async function updateProfile(req, res) {
  try {
    const userId = req.user.id;
    const { name, email, bioStatus } = req.body;
    console.log(bioStatus);
    

    if (!mongoose.Types.ObjectId.isValid(userId))
      return res.status(400).json({ error: "Invalid user ID" });

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { ...(name && { name }), ...(email && { email }), ...(bioStatus && {bioStatus}) },
      { new: true, select: "-password -__v" }
    );

    if (!updatedUser) return res.status(404).json({ error: "User not found" });

    res.json({ message: "Profile updated successfully", user: updatedUser });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
}

// Upload avatar to Cloudinary
async function uploadAvatar(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    // Upload file to Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: "avatars",
      public_id: `user_${req.user.id}_${Date.now()}`,
      overwrite: true,
      resource_type: "image",
    });

    // Delete the temporary file
    fs.unlinkSync(req.file.path);

    // Save Cloudinary URL in user document
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { avatar: result.secure_url },
      { new: true, select: "-password -__v" }
    );

    res.json({
      message: "Avatar uploaded successfully",
      avatarUrl: result.secure_url,
      user,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
}





// Delete avatar from Cloudinary and clear from user document
async function deleteAvatar(req, res) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    // Derive public_id from stored URL, e.g. avatars/user_abc_123
    if (user.avatar) {
      const uploadSegment = user.avatar.split('/upload/')[1];
      if (uploadSegment) {
        // strip leading version segment (v12345/) if present
        const withoutVersion = uploadSegment.replace(/^v\d+\//, '');
        // strip file extension
        const publicId = withoutVersion.replace(/\.[^/.]+$/, '');
        await cloudinary.uploader.destroy(publicId).catch(() => {}); // best-effort
      }
    }

    const updated = await User.findByIdAndUpdate(
      req.user.id,
      { $unset: { avatar: '' } },
      { new: true, select: '-password -__v' }
    );

    res.json({ message: 'Avatar removed successfully', user: updated });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

module.exports = {
  getUsers,
  getProfile,
  updateProfile,
  uploadAvatar,
  deleteAvatar,
};
