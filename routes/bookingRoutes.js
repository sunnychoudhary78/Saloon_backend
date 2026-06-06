const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const permissionMiddleware = require('../middlewares/permissionMiddleware');
const asyncHandler = require('../middlewares/asyncHandler');
const ctrl = require('../controllers/bookingController');

router.post('/query', authMiddleware, permissionMiddleware('booking.read'), asyncHandler(ctrl.query));
router.get('/:id', authMiddleware, permissionMiddleware('booking.read'), asyncHandler(ctrl.getById));
router.patch('/:id/status', authMiddleware, permissionMiddleware('booking.update'), asyncHandler(ctrl.updateStatus));

module.exports = router;
