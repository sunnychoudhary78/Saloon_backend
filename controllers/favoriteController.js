'use strict';

const { Op } = require('sequelize');
const { CustomerFavorite, Salon } = require('../models');
const AppError = require('../middlewares/AppError');
const { listFavoriteSalonIds } = require('../services/favoriteService');
const { buildBrowseSalonCards } = require('../services/salonBrowseService');
const { parseUserCoordinates } = require('../services/locationService');

const BROWSE_ATTRIBUTES = [
  'id',
  'salon_name',
  'salon_type',
  'city',
  'address',
  'formatted_address',
  'locality',
  'postal_code',
  'cover_image',
  'gallery_images',
  'latitude',
  'longitude',
  'opening_time',
  'closing_time',
  'is_featured',
];

exports.addFavorite = async (req, res, next) => {
  try {
    const { salon_id: salonId } = req.body;
    const salon = await Salon.findOne({
      where: { id: salonId, status: 'ACTIVE', is_active: true },
      attributes: ['id'],
    });
    if (!salon) throw new AppError('Salon not found', 404);

    const [row, created] = await CustomerFavorite.findOrCreate({
      where: { user_id: req.user.id, salon_id: salonId },
      defaults: { user_id: req.user.id, salon_id: salonId },
    });

    res.status(created ? 201 : 200).json({ data: row });
  } catch (err) {
    next(err);
  }
};

exports.listFavorites = async (req, res, next) => {
  try {
    const salonIds = await listFavoriteSalonIds(req.user.id);
    if (!salonIds.length) {
      return res.json({ data: [] });
    }

    const salons = await Salon.findAll({
      where: {
        id: { [Op.in]: salonIds },
        status: 'ACTIVE',
        is_active: true,
      },
      attributes: BROWSE_ATTRIBUTES,
    });

    const byId = new Map(salons.map((salon) => [salon.id, salon.get({ plain: true })]));
    const ordered = salonIds.map((id) => byId.get(id)).filter(Boolean);
    const userCoords = parseUserCoordinates(req.query);
    const data = await buildBrowseSalonCards(ordered, {
      userCoords,
      favoriteIds: new Set(ordered.map((salon) => salon.id)),
    });

    res.json({ data });
  } catch (err) {
    next(err);
  }
};

exports.removeFavorite = async (req, res, next) => {
  try {
    const deleted = await CustomerFavorite.destroy({
      where: { user_id: req.user.id, salon_id: req.params.salonId },
    });
    if (!deleted) throw new AppError('Favorite not found', 404);
    res.json({ message: 'Favorite removed' });
  } catch (err) {
    next(err);
  }
};
