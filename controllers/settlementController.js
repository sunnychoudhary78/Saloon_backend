const { queryLedger } = require('../services/settlementLedgerService');
const {
  createBatch,
  approveBatch,
  settleBatch,
  queryBatches,
} = require('../services/settlementBatchService');

exports.queryLedger = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.body.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.body.limit, 10) || 20, 1);
    const result = await queryLedger({
      salonId: req.body.salon_id,
      status: req.body.status,
      page,
      limit,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.queryBatches = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.body.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.body.limit, 10) || 20, 1);
    const result = await queryBatches({
      salonId: req.body.salon_id,
      status: req.body.status,
      page,
      limit,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.createBatch = async (req, res, next) => {
  try {
    const { salon_id: salonId, ledger_entry_ids: ledgerEntryIds, period_start, period_end, notes } = req.body;
    const batch = await createBatch({
      salonId,
      ledgerEntryIds,
      periodStart: period_start,
      periodEnd: period_end,
      notes,
      userId: req.user.id,
    });
    res.status(201).json({ data: batch });
  } catch (err) {
    next(err);
  }
};

exports.approveBatch = async (req, res, next) => {
  try {
    const batch = await approveBatch(req.params.id, req.user.id);
    res.json({ data: batch });
  } catch (err) {
    next(err);
  }
};

exports.settleBatch = async (req, res, next) => {
  try {
    const { settlement_reference: settlementReference, notes } = req.body;
    const batch = await settleBatch(req.params.id, req.user.id, { settlementReference, notes });
    res.json({ data: batch });
  } catch (err) {
    next(err);
  }
};
