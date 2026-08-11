'use strict';

const { Op, fn, col, where } = require('sequelize');
const { Service } = require('../models');
const AppError = require('../middlewares/AppError');

const DUPLICATE_MESSAGE = 'This service is already added for this gender';
const SERVICE_FOR_VALUES = ['MEN', 'WOMEN', 'UNISEX'];

function normalizeText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeServiceFor(value) {
  const normalized = String(value ?? '').trim().toUpperCase();
  return SERVICE_FOR_VALUES.includes(normalized) ? normalized : null;
}

function displayServiceName(serviceName) {
  const display = String(serviceName ?? '').trim().replace(/\s+/g, ' ');
  return display || 'This service';
}

function serviceForLabel(serviceFor) {
  const normalized = normalizeServiceFor(serviceFor) || 'UNISEX';
  if (normalized === 'MEN') return 'Men';
  if (normalized === 'WOMEN') return 'Women';
  return 'Everyone';
}

function duplicateServiceMessage(serviceName, serviceFor) {
  return `${displayServiceName(serviceName)} is already added for ${serviceForLabel(serviceFor)}`;
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
  serviceFor,
  excludeId = null,
  transaction = null,
}) {
  const normalizedServiceFor = normalizeServiceFor(serviceFor) || 'UNISEX';
  const conditions = {
    salon_id: salonId,
    service_for: normalizedServiceFor,
    [Op.and]: [
      where(
        fn('lower', fn('regexp_replace', fn('btrim', col('service_name')), '\\s+', ' ', 'g')),
        normalizeText(serviceName)
      ),
    ],
  };

  if (excludeId) conditions.id = { [Op.ne]: excludeId };

  const duplicate = await Service.findOne({
    attributes: ['id'],
    where: conditions,
    transaction,
  });
  if (duplicate) {
    throw new AppError(duplicateServiceMessage(serviceName, normalizedServiceFor), 409);
  }
}

function mapServiceIdentityConflict(error) {
  if (error?.name === 'SequelizeUniqueConstraintError') {
    return new AppError(DUPLICATE_MESSAGE, 409);
  }
  return error;
}

module.exports = {
  SERVICE_FOR_VALUES,
  DUPLICATE_MESSAGE,
  normalizeServiceFor,
  resolveServiceFor,
  duplicateServiceMessage,
  assertUniqueServiceIdentity,
  mapServiceIdentityConflict,
};
