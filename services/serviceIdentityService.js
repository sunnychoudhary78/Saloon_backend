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

function mixUnisexBlockedMessage(serviceName, existingFors) {
  const name = displayServiceName(serviceName);
  const hasMen = existingFors.includes('MEN');
  const hasWomen = existingFors.includes('WOMEN');
  if (hasMen && hasWomen) {
    return `${name} is already added for Men and Women. You cannot also add it as a unisex service.`;
  }
  if (hasMen) {
    return `${name} is already added for Men. You can add it for Women, but not as a unisex service.`;
  }
  return `${name} is already added for Women. You can add it for Men, but not as a unisex service.`;
}

function mixGenderedBlockedMessage(serviceName) {
  return `${displayServiceName(serviceName)} is already added for Everyone. Edit that service, or remove it before adding separate Men and Women versions.`;
}

/**
 * Returns a 409 message when this name cannot use [serviceFor] given siblings,
 * or null when the combination is allowed.
 */
function serviceIdentityConflict({ serviceName, serviceFor, existingServiceFors }) {
  const requested = normalizeServiceFor(serviceFor) || 'UNISEX';
  const existing = [...new Set(
    (existingServiceFors || [])
      .map((value) => normalizeServiceFor(value))
      .filter(Boolean)
  )];

  if (existing.includes(requested)) {
    return duplicateServiceMessage(serviceName, requested);
  }

  const hasUnisex = existing.includes('UNISEX');
  const hasGendered = existing.includes('MEN') || existing.includes('WOMEN');

  if (requested === 'UNISEX' && hasGendered) {
    return mixUnisexBlockedMessage(serviceName, existing);
  }
  if ((requested === 'MEN' || requested === 'WOMEN') && hasUnisex) {
    return mixGenderedBlockedMessage(serviceName);
  }
  return null;
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

function sameNameWhere({ salonId, serviceName, excludeId = null }) {
  const conditions = {
    salon_id: salonId,
    [Op.and]: [
      where(
        fn('lower', fn('regexp_replace', fn('btrim', col('service_name')), '\\s+', ' ', 'g')),
        normalizeText(serviceName)
      ),
    ],
  };
  if (excludeId) conditions.id = { [Op.ne]: excludeId };
  return conditions;
}

async function assertUniqueServiceIdentity({
  salonId,
  serviceName,
  serviceFor,
  excludeId = null,
  transaction = null,
}) {
  const siblings = await Service.findAll({
    attributes: ['id', 'service_for'],
    where: sameNameWhere({ salonId, serviceName, excludeId }),
    transaction,
  });

  const message = serviceIdentityConflict({
    serviceName,
    serviceFor,
    existingServiceFors: siblings.map((row) => row.service_for),
  });
  if (message) {
    throw new AppError(message, 409);
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
  serviceIdentityConflict,
  assertUniqueServiceIdentity,
  mapServiceIdentityConflict,
};
