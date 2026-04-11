// db.js
const mongoose = require("mongoose");
require("dotenv").config();

const connect = async () => {
  try {
    const connected = await mongoose.connect(process.env.MONGO_URI);
    if (connected) {
      console.log("Database connected successfully");
    }
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  }
};

module.exports = connect;
