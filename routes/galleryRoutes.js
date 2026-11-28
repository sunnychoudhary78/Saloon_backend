const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const asyncHandler = require('../middlewares/asyncHandler');
const galleryCtrl = require('../controllers/galleryController');

// Super Admin / Admin Gallery Management
router.post(
  '/query',
  authMiddleware,
  roleMiddleware(['SUPER_ADMIN', 'ADMIN']),
  asyncHandler(galleryCtrl.adminQueryPosts)
);

router.delete(
  '/:postId',
  authMiddleware,
  roleMiddleware(['SUPER_ADMIN', 'ADMIN']),
  asyncHandler(galleryCtrl.adminDeletePost)
);

router.patch(
  '/:postId/feature',
  authMiddleware,
  roleMiddleware(['SUPER_ADMIN', 'ADMIN']),
  asyncHandler(galleryCtrl.adminToggleFeature)
);

// Admin Customer AI Try-on Management
router.post(
  '/ai-tryon/query',
  authMiddleware,
  roleMiddleware(['SUPER_ADMIN', 'ADMIN']),
  asyncHandler(galleryCtrl.adminQueryAiTryons)
);

router.delete(
  '/ai-tryon/:id',
  authMiddleware,
  roleMiddleware(['SUPER_ADMIN', 'ADMIN']),
  asyncHandler(galleryCtrl.adminDeleteAiTryon)
);

module.exports = router;

