const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const permissionMiddleware = require('../middlewares/permissionMiddleware');
const asyncHandler = require('../middlewares/asyncHandler');
const ctrl = require('../controllers/settlementController');

router.post('/ledger/query', authMiddleware, permissionMiddleware('settlement.read'), asyncHandler(ctrl.queryLedger));
router.post('/batches/query', authMiddleware, permissionMiddleware('settlement.read'), asyncHandler(ctrl.queryBatches));
router.post('/batches', authMiddleware, permissionMiddleware('settlement.create'), asyncHandler(ctrl.createBatch));
router.patch('/batches/:id/approve', authMiddleware, permissionMiddleware('settlement.approve'), asyncHandler(ctrl.approveBatch));
router.patch('/batches/:id/settle', authMiddleware, permissionMiddleware('settlement.settle'), asyncHandler(ctrl.settleBatch));

module.exports = router;
