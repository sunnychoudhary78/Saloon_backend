const { Coupon } = require('../models');
const AppError = require('../middlewares/AppError');
const { genericQuery } = require('../services/genericQueryService');
const { couponRegistryByKey } = require('../config/columnRegistry');

const defaultColumns = ['code', 'discount_type', 'discount_value', 'valid_from', 'valid_to', 'status'];

exports.query = async (req, res, next) => {
  try {
    const result = await genericQuery(Coupon, req, 'coupons', defaultColumns, couponRegistryByKey);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { code, discount_type, discount_value, valid_from, valid_to, usage_limit, status } = req.body;
    if (!code || !discount_type || discount_value == null || !valid_from || !valid_to) {
      throw new AppError('code, discount_type, discount_value, valid_from, valid_to are required', 400);
    }
    const row = await Coupon.create({
      code: code.toUpperCase(),
      discount_type,
      discount_value,
      valid_from,
      valid_to,
      usage_limit,
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
    const row = await Coupon.findByPk(req.params.id);
    if (!row) throw new AppError('Coupon not found', 404);
    const fields = ['code', 'discount_type', 'discount_value', 'valid_from', 'valid_to', 'usage_limit', 'status'];
    for (const f of fields) {
      if (req.body[f] !== undefined) row[f] = f === 'code' ? req.body[f].toUpperCase() : req.body[f];
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
    const row = await Coupon.findByPk(req.params.id);
    if (!row) throw new AppError('Coupon not found', 404);
    row.status = 'INACTIVE';
    row.is_active = false;
    row.updated_by = req.user.id;
    await row.save();
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
};

exports.validate = async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code) throw new AppError('Coupon code is required', 400);
    const coupon = await Coupon.findOne({ where: { code: code.toUpperCase(), status: 'ACTIVE', is_active: true } });
    if (!coupon) throw new AppError('Invalid coupon', 404);
    const now = new Date();
    if (now < new Date(coupon.valid_from) || now > new Date(coupon.valid_to)) {
      throw new AppError('Coupon is not valid at this time', 400);
    }
    if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) {
      throw new AppError('Coupon usage limit reached', 400);
    }
    res.json({ valid: true, coupon });
  } catch (err) {
    next(err);
  }
};
