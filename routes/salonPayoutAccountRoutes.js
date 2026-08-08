const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const permissionMiddleware = require('../middlewares/permissionMiddleware');
const asyncHandler = require('../middlewares/asyncHandler');
const ctrl = require('../controllers/salonPayoutAccountController');

router.post('/query', authMiddleware, permissionMiddleware('payoutAccount.read'), asyncHandler(ctrl.query));
router.post('/:id/approve', authMiddleware, permissionMiddleware('payoutAccount.approve'), asyncHandler(ctrl.approve));
router.post('/:id/reject', authMiddleware, permissionMiddleware('payoutAccount.reject'), asyncHandler(ctrl.reject));

module.exports = router;
