const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const permissionMiddleware = require('../middlewares/permissionMiddleware');
const asyncHandler = require('../middlewares/asyncHandler');
const ctrl = require('../controllers/promotionalBannerController');

router.post('/query', authMiddleware, permissionMiddleware('banner.read'), asyncHandler(ctrl.query));
router.post('/', authMiddleware, permissionMiddleware('banner.create'), asyncHandler(ctrl.create));
router.put('/:id', authMiddleware, permissionMiddleware('banner.update'), asyncHandler(ctrl.update));
router.patch('/:id/inactivate', authMiddleware, permissionMiddleware('banner.makeInactive'), asyncHandler(ctrl.makeInactive));

module.exports = router;
