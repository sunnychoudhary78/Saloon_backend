const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const permissionMiddleware = require('../middlewares/permissionMiddleware');
const asyncHandler = require('../middlewares/asyncHandler');
const ctrl = require('../controllers/financeSettingsController');

router.get('/', authMiddleware, permissionMiddleware('financeSetting.read'), asyncHandler(ctrl.getSettings));
router.put('/', authMiddleware, permissionMiddleware('financeSetting.update'), asyncHandler(ctrl.updateSettings));
router.get('/history', authMiddleware, permissionMiddleware('financeSetting.read'), asyncHandler(ctrl.getHistory));

module.exports = router;
