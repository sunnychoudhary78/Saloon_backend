const express = require('express');
const router = express.Router();
const statsController = require('../controllers/statsController');
const authMiddleware = require('../middlewares/authMiddleware');
const permissionMiddleware = require('../middlewares/permissionMiddleware');
const asyncHandler = require('../middlewares/asyncHandler');

router.get(
  '/salon-overview',
  authMiddleware,
  permissionMiddleware('stats.read'),
  asyncHandler(statsController.getSalonOverview)
);

router.get(
  '/charts',
  authMiddleware,
  permissionMiddleware('stats.read'),
  asyncHandler(statsController.getCharts)
);

router.get(
  '/recent-activity',
  authMiddleware,
  permissionMiddleware('stats.read'),
  asyncHandler(statsController.getRecentActivity)
);

module.exports = router;
