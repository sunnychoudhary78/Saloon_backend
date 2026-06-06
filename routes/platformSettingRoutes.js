const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const permissionMiddleware = require('../middlewares/permissionMiddleware');
const asyncHandler = require('../middlewares/asyncHandler');
const ctrl = require('../controllers/platformSettingController');

router.get('/', authMiddleware, permissionMiddleware('platformSetting.read'), asyncHandler(ctrl.getAll));
router.put('/:setting_key', authMiddleware, permissionMiddleware('platformSetting.update'), asyncHandler(ctrl.update));

module.exports = router;
