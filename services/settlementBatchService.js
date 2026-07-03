const { Op } = require('sequelize');
const {
  SettlementBatch,
  SettlementLedger,
  PaymentLineItem,
  Salon,
  sequelize,
} = require('../models');
const AppError = require('../middlewares/AppError');

async function generateBatchNumber(transaction = null) {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `SB-${dateStr}-`;

  const last = await SettlementBatch.findOne({
    where: { batch_number: { [Op.like]: `${prefix}%` } },
    order: [['batch_number', 'DESC']],
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });

  let seq = 1;
  if (last) {
    const parts = last.batch_number.split('-');
    seq = parseInt(parts[parts.length - 1], 10) + 1;
  }
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

async function createBatch({ salonId, ledgerEntryIds, periodStart, periodEnd, notes, userId }) {
  const t = await sequelize.transaction();
  try {
    const entries = await SettlementLedger.findAll({
      where: {
        id: { [Op.in]: ledgerEntryIds },
        salon_id: salonId,
        status: 'PENDING',
        entry_type: { [Op.in]: ['SERVICE_SALON_NET', 'PREMIUM_SALON'] },
      },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (entries.length === 0) {
      throw new AppError('No pending salon earnings found for batch', 400);
    }

    const totalSalonNet = entries.reduce((sum, e) => sum + Number(e.amount), 0);
    const batch = await SettlementBatch.create({
      batch_number: await generateBatchNumber(t),
      salon_id: salonId,
      period_start: periodStart || null,
      period_end: periodEnd || null,
      total_salon_net: Math.round(totalSalonNet * 100) / 100,
      status: 'DRAFT',
      notes: notes || null,
      created_by: userId,
      updated_by: userId,
    }, { transaction: t });

    for (const entry of entries) {
      entry.status = 'IN_BATCH';
      entry.settlement_batch_id = batch.id;
      await entry.save({ transaction: t });

      if (entry.payment_line_item_id) {
        await PaymentLineItem.update(
          { settlement_status: 'IN_BATCH', settlement_batch_id: batch.id },
          { where: { id: entry.payment_line_item_id }, transaction: t },
        );
      }
    }

    await t.commit();
    return SettlementBatch.findByPk(batch.id, {
      include: [{ model: Salon, as: 'salon', attributes: ['id', 'salon_name'] }],
    });
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

async function approveBatch(batchId, userId) {
  const batch = await SettlementBatch.findByPk(batchId);
  if (!batch) throw new AppError('Settlement batch not found', 404);
  if (batch.status !== 'DRAFT') throw new AppError('Only draft batches can be approved', 400);

  batch.status = 'APPROVED';
  batch.approved_by = userId;
  batch.approved_at = new Date();
  batch.updated_by = userId;
  await batch.save();
  return batch;
}

async function settleBatch(batchId, userId, { settlementReference, notes }) {
  const t = await sequelize.transaction();
  try {
    const batch = await SettlementBatch.findByPk(batchId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!batch) throw new AppError('Settlement batch not found', 404);
    if (batch.status !== 'APPROVED') {
      throw new AppError('Only approved batches can be settled', 400);
    }

    const entries = await SettlementLedger.findAll({
      where: { settlement_batch_id: batchId },
      transaction: t,
    });

    const now = new Date();
    for (const entry of entries) {
      entry.status = 'SETTLED';
      entry.settled_at = now;
      entry.settlement_reference = settlementReference || null;
      await entry.save({ transaction: t });

      if (entry.payment_line_item_id) {
        await PaymentLineItem.update(
          { settlement_status: 'SETTLED' },
          { where: { id: entry.payment_line_item_id }, transaction: t },
        );
      }
    }

    batch.status = 'SETTLED';
    batch.settled_by = userId;
    batch.settled_at = now;
    batch.settlement_reference = settlementReference || null;
    if (notes) batch.notes = notes;
    batch.updated_by = userId;
    await batch.save({ transaction: t });

    await t.commit();
    return batch;
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

async function queryBatches({ salonId, status, page = 1, limit = 20 }) {
  const where = {};
  if (salonId) where.salon_id = salonId;
  if (status) where.status = status;

  const offset = (page - 1) * limit;
  const { count, rows } = await SettlementBatch.findAndCountAll({
    where,
    include: [{ model: Salon, as: 'salon', attributes: ['id', 'salon_name'] }],
    order: [['created_at', 'DESC']],
    limit,
    offset,
  });

  return {
    rows: rows.map((r) => r.get({ plain: true })),
    meta: { total: count, page, limit, totalPages: Math.ceil(count / limit) },
  };
}

module.exports = {
  createBatch,
  approveBatch,
  settleBatch,
  queryBatches,
};
