const express = require('express');
const router = express.Router();
const { createChat, getDirectChats, getGroupChats, getUserChats, leaveGroup } = require('../controllers/chat.controller');

router.post('/', createChat);
router.get('/', getDirectChats);
router.get('/group', getGroupChats);
router.get('/user/:userId', getUserChats);
router.post('/:chatId/leave', leaveGroup);

module.exports = router;
