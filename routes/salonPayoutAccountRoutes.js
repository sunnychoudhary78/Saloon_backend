const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const permissionMiddleware = require('../middlewares/permissionMiddleware');
const asyncHandler = require('../middlewares/asyncHandler');
const ctrl = require('../controllers/salonPayoutAccountController');

router.post('/query', authMiddleware, permissionMiddleware('payoutAccount.read'), asyncHandler(ctrl.query));

module.exports = router;
