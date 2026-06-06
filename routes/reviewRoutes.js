const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const permissionMiddleware = require('../middlewares/permissionMiddleware');
const asyncHandler = require('../middlewares/asyncHandler');
const ctrl = require('../controllers/reviewController');

router.post('/query', authMiddleware, permissionMiddleware('review.read'), asyncHandler(ctrl.query));
router.patch('/:id/publish', authMiddleware, permissionMiddleware('review.moderate'), asyncHandler(ctrl.publish));
router.patch('/:id/hide', authMiddleware, permissionMiddleware('review.hide'), asyncHandler(ctrl.hide));

module.exports = router;
