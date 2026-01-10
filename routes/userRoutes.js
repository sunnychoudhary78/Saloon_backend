const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const permissionMiddleware = require('../middlewares/permissionMiddleware');
const { createUser, getAllUsers, getUserById, updateUser } = require('../controllers/userController');

// Require permission 'user.create' to create a user
router.post('/', authMiddleware, permissionMiddleware('user.create'), createUser);

// Require permission 'user.read' to get all users
router.get('/', authMiddleware, permissionMiddleware('user.read'), getAllUsers);

// Get single user by id
router.get('/:id', authMiddleware, permissionMiddleware('user.read'), getUserById);

// Update user
router.put('/:id', authMiddleware, permissionMiddleware('user.update'), updateUser);

module.exports = router;
