const express = require('express');
const router = express.Router();
const statsController = require('../controllers/statsController');
const authMiddleware = require('../middlewares/authMiddleware');
const permissionMiddleware = require('../middlewares/permissionMiddleware');
const asyncHandler = require('../middlewares/asyncHandler');

// GET /api/stats/admin-overview
// Requires 'stats.read' permission
router.get(
  '/admin-overview',
  authMiddleware,
  permissionMiddleware('stats.read'),
  statsController.getAdminOverview
);

module.exports = router;
