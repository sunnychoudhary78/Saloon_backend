'use strict';

const { Op } = require('sequelize');
const { CustomerFavorite } = require('../models');

async function listFavoriteSalonIds(userId, salonIds = null) {
  if (!userId) return [];
  const where = { user_id: userId };
  if (Array.isArray(salonIds)) {
    if (!salonIds.length) return [];
    where.salon_id = { [Op.in]: salonIds };
  }
  const rows = await CustomerFavorite.findAll({
    where,
    attributes: ['salon_id'],
    raw: true,
  });
  return rows.map((row) => row.salon_id);
}

async function isSalonFavorited(userId, salonId) {
  if (!userId || !salonId) return false;
  const row = await CustomerFavorite.findOne({
    where: { user_id: userId, salon_id: salonId },
    attributes: ['id'],
  });
  return Boolean(row);
}

module.exports = {
  listFavoriteSalonIds,
  isSalonFavorited,
};
