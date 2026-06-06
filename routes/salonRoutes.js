const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const permissionMiddleware = require('../middlewares/permissionMiddleware');
const asyncHandler = require('../middlewares/asyncHandler');
const ctrl = require('../controllers/salonController');

router.post('/query', authMiddleware, permissionMiddleware('salon.read'), asyncHandler(ctrl.query));
router.get('/:id', authMiddleware, permissionMiddleware('salon.read'), asyncHandler(ctrl.getById));
router.put('/:id', authMiddleware, permissionMiddleware('salon.update'), asyncHandler(ctrl.update));
router.patch('/:id/suspend', authMiddleware, permissionMiddleware('salon.suspend'), asyncHandler(ctrl.suspend));
router.patch('/:id/close', authMiddleware, permissionMiddleware('salon.close'), asyncHandler(ctrl.close));

module.exports = router;
