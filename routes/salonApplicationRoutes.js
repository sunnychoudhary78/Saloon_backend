const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const permissionMiddleware = require('../middlewares/permissionMiddleware');
const asyncHandler = require('../middlewares/asyncHandler');
const ctrl = require('../controllers/salonApplicationController');

router.post('/query', authMiddleware, permissionMiddleware('salonApplication.read'), asyncHandler(ctrl.query));
router.get('/:id', authMiddleware, permissionMiddleware('salonApplication.read'), asyncHandler(ctrl.getById));
router.post('/:id/approve', authMiddleware, permissionMiddleware('salonApplication.approve'), asyncHandler(ctrl.approve));
router.post('/:id/reject', authMiddleware, permissionMiddleware('salonApplication.reject'), asyncHandler(ctrl.reject));

module.exports = router;
