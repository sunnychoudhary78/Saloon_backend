'use strict';

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const asyncHandler = require('../middlewares/asyncHandler');
const { uploadAiFaceImages } = require('../middlewares/upload');
const ctrl = require('../controllers/aiStylistController');
const {
  validateCreateSession,
  validateAnalyzeFace,
  validateChatMessage,
  validateTryOn,
} = require('../validators/aiStylistValidator');

const customerGuard = [authMiddleware, roleMiddleware(['CUSTOMER', 'SALON_OWNER'])];

router.post(
  '/sessions',
  ...customerGuard,
  validateCreateSession,
  asyncHandler(ctrl.createSession)
);

router.get(
  '/sessions',
  ...customerGuard,
  asyncHandler(ctrl.listSessions)
);

router.get(
  '/sessions/:sessionId/messages',
  ...customerGuard,
  asyncHandler(ctrl.getSessionMessages)
);

router.delete(
  '/sessions/:sessionId',
  ...customerGuard,
  asyncHandler(ctrl.deleteSession)
);

router.post(
  '/sessions/:sessionId/analyze',
  ...customerGuard,
  uploadAiFaceImages,
  validateAnalyzeFace,
  asyncHandler(ctrl.analyzeFace)
);

router.post(
  '/sessions/:sessionId/chat',
  ...customerGuard,
  validateChatMessage,
  asyncHandler(ctrl.sendChatMessage)
);

router.get(
  '/analyses/:analysisId/salons',
  ...customerGuard,
  asyncHandler(ctrl.getRecommendedSalons)
);

router.post(
  '/analyses/:analysisId/try-on',
  ...customerGuard,
  validateTryOn,
  asyncHandler(ctrl.generateTryOn)
);

module.exports = router;
