'use strict';

const { Op, fn, col, where } = require('sequelize');
const { Service } = require('../models');
const AppError = require('../middlewares/AppError');

const DUPLICATE_MESSAGE = 'An identical service already exists for this salon';

function normalizeText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeDescription(value) {
  const normalized = normalizeText(value);
  return normalized || '';
}

async function assertUniqueServiceIdentity({
  salonId,
  serviceName,
  description,
  price,
  excludeId = null,
  transaction = null,
}) {
  const conditions = {
    salon_id: salonId,
    price,
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
  assertUniqueServiceIdentity,
  mapServiceIdentityConflict,
};
