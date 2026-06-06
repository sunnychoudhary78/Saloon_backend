const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const permissionMiddleware = require('../middlewares/permissionMiddleware');
const asyncHandler = require('../middlewares/asyncHandler');
const ctrl = require('../controllers/customerController');

router.post('/query', authMiddleware, permissionMiddleware('customer.read'), asyncHandler(ctrl.query));
router.get('/:id', authMiddleware, permissionMiddleware('customer.read'), asyncHandler(ctrl.getById));
router.patch('/:id/block', authMiddleware, permissionMiddleware('customer.block'), asyncHandler(ctrl.block));

module.exports = router;
