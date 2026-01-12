const express = require('express');
const router = express.Router();
const controller = require('../controllers/bloodGroupController');
const authMiddleware = require('../middlewares/authMiddleware');
const permissionMiddleware = require('../middlewares/permissionMiddleware');
const asyncHandler = require('../middlewares/asyncHandler');

router.get('/', authMiddleware, asyncHandler(controller.getAll));
router.post('/query', authMiddleware, asyncHandler(controller.query));
router.post('/', authMiddleware, permissionMiddleware('variables.create'), asyncHandler(controller.create));
router.patch('/:id', authMiddleware, permissionMiddleware('variables.update'), asyncHandler(controller.update));
router.delete('/:id', authMiddleware, permissionMiddleware('variables.delete'), asyncHandler(controller.remove));

module.exports = router;
