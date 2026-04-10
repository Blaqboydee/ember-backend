// backend/routes/user.routes.js
const express = require("express");
const router = express.Router();
const authenticateToken = require("../middlewares/auth.middleware");

const {
  getUsers,
  getProfile,
  updateProfile,
  uploadAvatar,
  deleteAvatar,
} = require("../controllers/user.controller");

const multer = require("multer");
const upload = multer({ dest: "tmp/" }); // temporary storage before Cloudinary

// User routes

// Get all users (for starting a chat)
router.get("/", getUsers);

// Logged-in user's profile
router.get("/profile", authenticateToken, getProfile);

// Update profile (name, email)
router.put("/profile", authenticateToken, updateProfile);

// Upload avatar to Cloudinary
router.post("/upload-avatar", authenticateToken, upload.single("avatar"), uploadAvatar);

// Delete avatar
router.delete("/delete-avatar", authenticateToken, deleteAvatar);

module.exports = router;
