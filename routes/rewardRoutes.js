const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const permissionMiddleware = require('../middlewares/permissionMiddleware');
const asyncHandler = require('../middlewares/asyncHandler');
const { uploadRewardImage } = require('../middlewares/upload');
const ctrl = require('../controllers/rewardController');

router.post('/query', authMiddleware, permissionMiddleware('reward.read'), asyncHandler(ctrl.query));
router.post('/', authMiddleware, permissionMiddleware('reward.create'), uploadRewardImage, asyncHandler(ctrl.create));
router.put('/:id', authMiddleware, permissionMiddleware('reward.update'), uploadRewardImage, asyncHandler(ctrl.update));
router.delete('/:id', authMiddleware, permissionMiddleware('reward.delete'), asyncHandler(ctrl.delete));

module.exports = router;

