const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const permissionMiddleware = require('../middlewares/permissionMiddleware');
const asyncHandler = require('../middlewares/asyncHandler');
const ctrl = require('../controllers/otpUsageController');

router.get(
  '/insights',
  authMiddleware,
  permissionMiddleware('platformSetting.read'),
  asyncHandler(ctrl.getInsights),
);
router.post(
  '/consumers/query',
  authMiddleware,
  permissionMiddleware('platformSetting.read'),
  asyncHandler(ctrl.queryConsumers),
);
router.put(
  '/config',
  authMiddleware,
  permissionMiddleware('platformSetting.update'),
  asyncHandler(ctrl.updateConfig),
);
router.post(
  '/blocks',
  authMiddleware,
  permissionMiddleware('platformSetting.update'),
  asyncHandler(ctrl.blockPhone),
);
router.delete(
  '/blocks/:phone',
  authMiddleware,
  permissionMiddleware('platformSetting.update'),
  asyncHandler(ctrl.unblockPhone),
);

module.exports = router;
