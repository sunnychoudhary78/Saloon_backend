'use strict';

const { CustomerFavorite, Salon } = require('../models');
const AppError = require('../middlewares/AppError');
const { listFavoriteSalonIds } = require('../services/favoriteService');

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
    res.json({ data: salonIds });
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
