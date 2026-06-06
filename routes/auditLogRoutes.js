const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const permissionMiddleware = require('../middlewares/permissionMiddleware');
const asyncHandler = require('../middlewares/asyncHandler');
const ctrl = require('../controllers/auditLogController');

router.post('/query', authMiddleware, permissionMiddleware('auditLog.read'), asyncHandler(ctrl.query));

module.exports = router;
