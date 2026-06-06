const { PromotionalBanner } = require('../models');
const AppError = require('../middlewares/AppError');
const { genericQuery } = require('../services/genericQueryService');
const { bannerRegistryByKey } = require('../config/columnRegistry');

const defaultColumns = ['title', 'redirect_type', 'sort_order', 'status'];

exports.query = async (req, res, next) => {
  try {
    const result = await genericQuery(PromotionalBanner, req, 'promotional_banners', defaultColumns, bannerRegistryByKey);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { title, image, redirect_type, redirect_value, sort_order, status } = req.body;
    if (!title || !image) throw new AppError('title and image are required', 400);
    const row = await PromotionalBanner.create({
      title,
      image,
      redirect_type: redirect_type || 'NONE',
      redirect_value,
      sort_order: sort_order || 0,
      status: status || 'ACTIVE',
      created_by: req.user.id,
      updated_by: req.user.id,
    });
    res.status(201).json({ data: row });
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const row = await PromotionalBanner.findByPk(req.params.id);
    if (!row) throw new AppError('Banner not found', 404);
    const fields = ['title', 'image', 'redirect_type', 'redirect_value', 'sort_order', 'status'];
    for (const f of fields) {
      if (req.body[f] !== undefined) row[f] = req.body[f];
    }
    row.updated_by = req.user.id;
    await row.save();
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
};

exports.makeInactive = async (req, res, next) => {
  try {
    const row = await PromotionalBanner.findByPk(req.params.id);
    if (!row) throw new AppError('Banner not found', 404);
    row.status = 'INACTIVE';
    row.is_active = false;
    row.updated_by = req.user.id;
    await row.save();
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
};

exports.getActive = async (req, res, next) => {
  try {
    const rows = await PromotionalBanner.findAll({
      where: { status: 'ACTIVE', is_active: true },
      order: [['sort_order', 'ASC']],
    });
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
};
