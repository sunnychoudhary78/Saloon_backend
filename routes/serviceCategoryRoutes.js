const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const permissionMiddleware = require('../middlewares/permissionMiddleware');
const asyncHandler = require('../middlewares/asyncHandler');
const ctrl = require('../controllers/serviceCategoryController');

router.get('/', authMiddleware, permissionMiddleware('serviceCategory.read'), asyncHandler(ctrl.getAll));
router.post('/query', authMiddleware, permissionMiddleware('serviceCategory.read'), asyncHandler(ctrl.query));
router.post('/', authMiddleware, permissionMiddleware('serviceCategory.create'), asyncHandler(ctrl.create));
router.put('/:id', authMiddleware, permissionMiddleware('serviceCategory.update'), asyncHandler(ctrl.update));
router.patch('/:id/inactivate', authMiddleware, permissionMiddleware('serviceCategory.makeInactive'), asyncHandler(ctrl.makeInactive));

module.exports = router;
