const { PromotionalBanner } = require('../models');
const AppError = require('../middlewares/AppError');
const { genericQuery } = require('../services/genericQueryService');
const { bannerRegistryByKey } = require('../config/columnRegistry');

const defaultColumns = ['title', 'redirect_type', 'sort_order', 'status'];
const redirectTypes = new Set(['NONE', 'SALON', 'SERVICE', 'EXTERNAL_URL']);

function validateRedirectType(value) {
  if (value !== undefined && !redirectTypes.has(value)) {
    throw new AppError('Invalid redirect_type', 400);
  }
}

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
    let image = req.body.image;
    if (req.file) {
      image = `/api/uploads/banners/${req.file.filename}`;
    }
    const { title, redirect_type, redirect_value, sort_order, status } = req.body;
    if (!title) throw new AppError('Title is required', 400);
    if (!image) throw new AppError('Banner image is required (upload an image file or provide URL)', 400);
    validateRedirectType(redirect_type);
    const row = await PromotionalBanner.create({
      title,
      image,
      redirect_type: redirect_type || 'NONE',
      redirect_value: redirect_type === 'NONE' ? null : redirect_value,
      sort_order: sort_order ? parseInt(sort_order, 10) : 0,
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
    validateRedirectType(req.body.redirect_type);
    if (req.file) {
      row.image = `/api/uploads/banners/${req.file.filename}`;
    }
    const fields = ['title', 'image', 'redirect_type', 'redirect_value', 'sort_order', 'status'];
    for (const f of fields) {
      if (req.body[f] !== undefined) row[f] = req.body[f];
    }
    if (row.redirect_type === 'NONE') {
      row.redirect_value = null;
    }
    row.updated_by = req.user.id;
    await row.save();
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
};

exports.deleteBanner = async (req, res, next) => {
  try {
    const row = await PromotionalBanner.findByPk(req.params.id);
    if (!row) throw new AppError('Banner not found', 404);
    await row.destroy();
    res.json({ message: 'Banner deleted successfully' });
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
