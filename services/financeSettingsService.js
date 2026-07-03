const { FinanceSetting, FinanceSettingsHistory, sequelize } = require('../models');
const AppError = require('../middlewares/AppError');
const { logAudit } = require('./auditService');

function toNumber(value) {
  return Number(value);
}

function shapeFinanceSettings(row) {
  if (!row) return null;
  const plain = typeof row.get === 'function' ? row.get({ plain: true }) : row;
  return {
    ...plain,
    service_commission_percent: toNumber(plain.service_commission_percent),
    premium_fee_platform_percent: toNumber(plain.premium_fee_platform_percent),
    premium_fee_salon_percent: toNumber(plain.premium_fee_salon_percent),
  };
}

function validatePercentages({
  service_commission_percent: serviceCommission,
  premium_fee_platform_percent: platformShare,
  premium_fee_salon_percent: salonShare,
}) {
  const service = Number(serviceCommission);
  const platform = Number(platformShare);
  const salon = Number(salonShare);

  if (!Number.isFinite(service) || service < 0 || service > 100) {
    throw new AppError('service_commission_percent must be between 0 and 100', 400);
  }
  if (!Number.isFinite(platform) || !Number.isFinite(salon)) {
    throw new AppError('Premium fee split percentages are required', 400);
  }
  if (Math.round((platform + salon) * 100) / 100 !== 100) {
    throw new AppError('premium_fee_platform_percent + premium_fee_salon_percent must equal 100', 400);
  }
}

async function getCurrentSettings() {
  let row = await FinanceSetting.findOne();
  if (!row) {
    row = await FinanceSetting.create({
      current_version: 1,
      service_commission_percent: 10,
      premium_fee_platform_percent: 70,
      premium_fee_salon_percent: 30,
    });
    await FinanceSettingsHistory.create({
      version: 1,
      service_commission_percent: 10,
      premium_fee_platform_percent: 70,
      premium_fee_salon_percent: 30,
      old_values: {},
      new_values: {
        service_commission_percent: 10,
        premium_fee_platform_percent: 70,
        premium_fee_salon_percent: 30,
      },
      change_reason: 'Auto-created default',
    });
  }
  return shapeFinanceSettings(row);
}

async function updateSettings(userId, payload, req = null) {
  validatePercentages(payload);

  const t = await sequelize.transaction();
  try {
    const current = await FinanceSetting.findOne({ transaction: t, lock: t.LOCK.UPDATE });
    if (!current) throw new AppError('Finance settings not found', 404);

    const oldValues = {
      service_commission_percent: toNumber(current.service_commission_percent),
      premium_fee_platform_percent: toNumber(current.premium_fee_platform_percent),
      premium_fee_salon_percent: toNumber(current.premium_fee_salon_percent),
      current_version: current.current_version,
    };

    const newValues = {
      service_commission_percent: Number(payload.service_commission_percent),
      premium_fee_platform_percent: Number(payload.premium_fee_platform_percent),
      premium_fee_salon_percent: Number(payload.premium_fee_salon_percent),
    };

    const nextVersion = current.current_version + 1;

    await FinanceSettingsHistory.create({
      version: nextVersion,
      service_commission_percent: newValues.service_commission_percent,
      premium_fee_platform_percent: newValues.premium_fee_platform_percent,
      premium_fee_salon_percent: newValues.premium_fee_salon_percent,
      changed_by: userId,
      changed_at: new Date(),
      old_values: oldValues,
      new_values: { ...newValues, current_version: nextVersion },
      change_reason: payload.change_reason || null,
    }, { transaction: t });

    current.current_version = nextVersion;
    current.service_commission_percent = newValues.service_commission_percent;
    current.premium_fee_platform_percent = newValues.premium_fee_platform_percent;
    current.premium_fee_salon_percent = newValues.premium_fee_salon_percent;
    current.updated_by = userId;
    await current.save({ transaction: t });

    await t.commit();

    await logAudit({
      userId,
      action: 'financeSetting.update',
      entityType: 'FinanceSetting',
      entityId: current.id,
      oldValues,
      newValues: { ...newValues, current_version: nextVersion },
      req,
    });

    return shapeFinanceSettings(current);
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

async function listHistory({ page = 1, limit = 20 } = {}) {
  const offset = (page - 1) * limit;
  const { count, rows } = await FinanceSettingsHistory.findAndCountAll({
    order: [['version', 'DESC']],
    limit,
    offset,
  });
  return {
    rows: rows.map((r) => r.get({ plain: true })),
    meta: { total: count, page, limit, totalPages: Math.ceil(count / limit) },
  };
}

module.exports = {
  getCurrentSettings,
  updateSettings,
  listHistory,
  validatePercentages,
  shapeFinanceSettings,
};
