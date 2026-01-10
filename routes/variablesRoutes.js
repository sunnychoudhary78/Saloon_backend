'use strict';

const express = require('express');
const router = express.Router();
const controller = require('../controllers/variablesController');
const authMiddleware = require('../middlewares/authMiddleware');
const asyncHandler = require('../middlewares/asyncHandler');
const permissionMiddleware = require('../middlewares/permissionMiddleware');

router.get('/:type', authMiddleware, asyncHandler(controller.list));
router.post('/:type', authMiddleware, permissionMiddleware('variables.create'), asyncHandler(controller.create));
router.patch('/:type/:id', authMiddleware, permissionMiddleware('variables.update'), asyncHandler(controller.update));
router.delete('/:type/:id', authMiddleware, permissionMiddleware('variables.delete'), asyncHandler(controller.remove));

module.exports = router;
