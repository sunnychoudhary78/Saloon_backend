const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const permissionMiddleware = require('../middlewares/permissionMiddleware');
const asyncHandler = require('../middlewares/asyncHandler');
const ctrl = require('../controllers/salonOwnerController');

router.post('/query', authMiddleware, permissionMiddleware('salonOwner.read'), asyncHandler(ctrl.query));
router.get('/:id', authMiddleware, permissionMiddleware('salonOwner.read'), asyncHandler(ctrl.getById));
router.put('/:id', authMiddleware, permissionMiddleware('salonOwner.update'), asyncHandler(ctrl.update));
router.patch('/:id/block', authMiddleware, permissionMiddleware('salonOwner.block'), asyncHandler(ctrl.block));

module.exports = router;
