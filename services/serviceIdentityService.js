'use strict';

const { Op, fn, col, where } = require('sequelize');
const { Service } = require('../models');
const AppError = require('../middlewares/AppError');

const DUPLICATE_MESSAGE = 'An identical service already exists for this salon';
const SERVICE_FOR_VALUES = ['MEN', 'WOMEN', 'UNISEX'];

function normalizeText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeDescription(value) {
  const normalized = normalizeText(value);
  return normalized || '';
}

function normalizeServiceFor(value) {
  const normalized = String(value ?? '').trim().toUpperCase();
  return SERVICE_FOR_VALUES.includes(normalized) ? normalized : null;
}

/**
 * Resolve service_for from salon type + optional client value.
 * MEN/WOMEN salons always lock to salon type; UNISEX uses requested/existing/default.
 */
function resolveServiceFor({ salonType, requested, existing = null, isCreate = false }) {
  const locked = String(salonType || '').trim().toUpperCase();
  if (locked === 'MEN' || locked === 'WOMEN') return locked;

  if (requested !== undefined && requested !== null && String(requested).trim() !== '') {
    const normalized = normalizeServiceFor(requested);
    if (!normalized) {
      throw new AppError('service_for must be MEN, WOMEN, or UNISEX', 400);
    }
    return normalized;
  }

  if (existing?.service_for) {
    const fromExisting = normalizeServiceFor(existing.service_for);
    if (fromExisting) return fromExisting;
  }

  if (isCreate) return 'UNISEX';
  throw new AppError('service_for is required', 400);
}

async function assertUniqueServiceIdentity({
  salonId,
  serviceName,
  description,
  price,
  serviceFor,
  excludeId = null,
  transaction = null,
}) {
  const normalizedServiceFor = normalizeServiceFor(serviceFor) || 'UNISEX';
  const conditions = {
    salon_id: salonId,
    price,
    service_for: normalizedServiceFor,
    [Op.and]: [
      where(
        fn('lower', fn('regexp_replace', fn('btrim', col('service_name')), '\\s+', ' ', 'g')),
        normalizeText(serviceName)
      ),
      where(
        fn(
          'coalesce',
          fn('lower', fn('regexp_replace', fn('btrim', col('description')), '\\s+', ' ', 'g')),
          ''
        ),
        normalizeDescription(description)
      ),
    ],
  };

  if (excludeId) conditions.id = { [Op.ne]: excludeId };

  const duplicate = await Service.findOne({
    attributes: ['id'],
    where: conditions,
    transaction,
  });
  if (duplicate) throw new AppError(DUPLICATE_MESSAGE, 409);
}

function mapServiceIdentityConflict(error) {
  if (error?.name === 'SequelizeUniqueConstraintError') {
    return new AppError(DUPLICATE_MESSAGE, 409);
  }
  return error;
}

module.exports = {
  SERVICE_FOR_VALUES,
  normalizeServiceFor,
  resolveServiceFor,
  assertUniqueServiceIdentity,
  mapServiceIdentityConflict,
};
