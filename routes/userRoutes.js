const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const permissionMiddleware = require('../middlewares/permissionMiddleware');
const asyncHandler = require('../middlewares/asyncHandler');
const {
  createUser,
  getAllUsers,
  getUserById,
  updateUser,
  query,
  convertAccount,
} = require('../controllers/userController');

router.post('/', authMiddleware, permissionMiddleware('user.create'), createUser);
router.post('/query', authMiddleware, permissionMiddleware('user.read'), asyncHandler(query));
router.get('/', authMiddleware, permissionMiddleware('user.read'), getAllUsers);
router.get('/:id', authMiddleware, permissionMiddleware('user.read'), getUserById);
router.put('/:id', authMiddleware, permissionMiddleware('user.update'), updateUser);
router.post(
  '/:id/convert-account',
  authMiddleware,
  permissionMiddleware('user.update'),
  asyncHandler(convertAccount)
);

module.exports = router;
