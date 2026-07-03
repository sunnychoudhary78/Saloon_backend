const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const permissionMiddleware = require('../middlewares/permissionMiddleware');
const asyncHandler = require('../middlewares/asyncHandler');
const ctrl = require('../controllers/paymentController');

router.post('/query', authMiddleware, permissionMiddleware('payment.read'), asyncHandler(ctrl.query));
router.get('/:id', authMiddleware, permissionMiddleware('payment.read'), asyncHandler(ctrl.getById));

module.exports = router;
