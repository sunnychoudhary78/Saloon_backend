const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const permissionMiddleware = require('../middlewares/permissionMiddleware');
const asyncHandler = require('../middlewares/asyncHandler');
const ctrl = require('../controllers/couponController');

router.post('/query', authMiddleware, permissionMiddleware('coupon.read'), asyncHandler(ctrl.query));
router.post('/', authMiddleware, permissionMiddleware('coupon.create'), asyncHandler(ctrl.create));
router.put('/:id', authMiddleware, permissionMiddleware('coupon.update'), asyncHandler(ctrl.update));
router.patch('/:id/inactivate', authMiddleware, permissionMiddleware('coupon.makeInactive'), asyncHandler(ctrl.makeInactive));

module.exports = router;
