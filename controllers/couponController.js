const { Coupon } = require('../models');
const AppError = require('../middlewares/AppError');
const { genericQuery } = require('../services/genericQueryService');
const { couponRegistryByKey } = require('../config/columnRegistry');
const { Op } = require('sequelize');

const defaultColumns = ['title', 'code', 'discount_type', 'discount_value', 'min_order_value', 'valid_from', 'valid_to', 'status'];

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
    const {
      code,
      title,
      description,
      discount_type,
      discount_value,
      min_order_value,
      max_discount_amount,
      valid_from,
      valid_to,
      usage_limit,
      status,
    } = req.body;

    if (!code || !discount_type || discount_value == null || !valid_from || !valid_to) {
      throw new AppError('code, discount_type, discount_value, valid_from, valid_to are required', 400);
    }

    let imageUrl = req.body.image || null;
    if (req.file) {
      imageUrl = `/api/uploads/coupons/${req.file.filename}`;
    }

    const row = await Coupon.create({
      code: code.trim().toUpperCase(),
      title: title?.trim() || null,
      description: description?.trim() || null,
      image: imageUrl,
      discount_type,
      discount_value: parseFloat(discount_value),
      min_order_value: min_order_value != null && min_order_value !== '' ? parseFloat(min_order_value) : 0,
      max_discount_amount: max_discount_amount != null && max_discount_amount !== '' ? parseFloat(max_discount_amount) : null,
      valid_from: new Date(valid_from),
      valid_to: new Date(valid_to),
      usage_limit: usage_limit != null && usage_limit !== '' ? parseInt(usage_limit, 10) : null,
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

    const fields = [
      'code',
      'title',
      'description',
      'discount_type',
      'discount_value',
      'min_order_value',
      'max_discount_amount',
      'valid_from',
      'valid_to',
      'usage_limit',
      'status',
    ];

    for (const f of fields) {
      if (req.body[f] !== undefined) {
        if (f === 'code') row[f] = req.body[f].trim().toUpperCase();
        else if (f === 'discount_value' || f === 'min_order_value' || f === 'max_discount_amount') {
          row[f] = req.body[f] !== '' && req.body[f] != null ? parseFloat(req.body[f]) : null;
        } else if (f === 'usage_limit') {
          row[f] = req.body[f] !== '' && req.body[f] != null ? parseInt(req.body[f], 10) : null;
        } else {
          row[f] = req.body[f];
        }
      }
    }

    if (req.file) {
      row.image = `/api/uploads/coupons/${req.file.filename}`;
    } else if (req.body.image !== undefined) {
      row.image = req.body.image;
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
    const { code, order_amount } = req.body;
    if (!code) throw new AppError('Coupon code is required', 400);

    const coupon = await Coupon.findOne({
      where: { code: code.trim().toUpperCase(), status: 'ACTIVE', is_active: true },
    });
    if (!coupon) throw new AppError('Invalid coupon code', 404);

    const now = new Date();
    if (now < new Date(coupon.valid_from) || now > new Date(coupon.valid_to)) {
      throw new AppError('Coupon has expired or is not yet active', 400);
    }

    if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) {
      throw new AppError('Coupon usage limit reached', 400);
    }

    const orderTotal = order_amount != null ? parseFloat(order_amount) : null;
    const minOrder = parseFloat(coupon.min_order_value || 0);

    if (orderTotal !== null && minOrder > 0 && orderTotal < minOrder) {
      throw new AppError(`Minimum order value of ₹${minOrder.toFixed(2)} required to apply this coupon`, 400);
    }

    let discountAmount = 0;
    if (orderTotal !== null) {
      if (coupon.discount_type === 'PERCENT') {
        const rawDiscount = (orderTotal * parseFloat(coupon.discount_value)) / 100;
        const maxCap = coupon.max_discount_amount ? parseFloat(coupon.max_discount_amount) : null;
        discountAmount = maxCap ? Math.min(rawDiscount, maxCap) : rawDiscount;
      } else {
        discountAmount = Math.min(orderTotal, parseFloat(coupon.discount_value));
      }
    }

    res.json({
      valid: true,
      coupon,
      discount_amount: parseFloat(discountAmount.toFixed(2)),
      final_total: orderTotal !== null ? Math.max(0, parseFloat((orderTotal - discountAmount).toFixed(2))) : null,
    });
  } catch (err) {
    next(err);
  }
};

// Customer Mobile App: List active public coupons for checkout
exports.listPublic = async (req, res, next) => {
  try {
    const now = new Date();
    const coupons = await Coupon.findAll({
      where: {
        status: 'ACTIVE',
        is_active: true,
        valid_from: { [Op.lte]: now },
        valid_to: { [Op.gte]: now },
      },
      order: [['created_at', 'DESC']],
    });
    res.json({ data: coupons });
  } catch (err) {
    next(err);
  }
};
