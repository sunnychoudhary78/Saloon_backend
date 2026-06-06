const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const permissionMiddleware = require('../middlewares/permissionMiddleware');
const asyncHandler = require('../middlewares/asyncHandler');
const ctrl = require('../controllers/serviceController');

router.post('/query', authMiddleware, permissionMiddleware('service.read'), asyncHandler(ctrl.query));
router.post('/', authMiddleware, permissionMiddleware('service.create'), asyncHandler(ctrl.create));
router.put('/:id', authMiddleware, permissionMiddleware('service.update'), asyncHandler(ctrl.update));
router.patch('/:id/inactivate', authMiddleware, permissionMiddleware('service.makeInactive'), asyncHandler(ctrl.makeInactive));

module.exports = router;
