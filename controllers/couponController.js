const { Coupon, Customer, CustomerReward, Reward } = require('../models');
const AppError = require('../middlewares/AppError');
const { genericQuery } = require('../services/genericQueryService');
const { couponRegistryByKey } = require('../config/columnRegistry');
const { calculateVoucherDiscount } = require('../services/rewardSelectionService');
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
        } else if (f === 'status') {
          row.status = req.body.status;
          row.is_active = req.body.status === 'ACTIVE';
        } else if (f === 'valid_from' || f === 'valid_to') {
          row[f] = req.body[f] ? new Date(req.body[f]) : row[f];
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

exports.deleteCoupon = async (req, res, next) => {
  try {
    const row = await Coupon.findByPk(req.params.id);
    if (!row) throw new AppError('Coupon not found', 404);
    await row.destroy();
    res.json({ success: true, message: 'Coupon deleted successfully' });
  } catch (err) {
    next(err);
  }
};

function mapPersonalRewardToCoupon(cr) {
  const reward = cr.reward;
  return {
    id: cr.id,
    code: cr.issued_code || reward.reward_code,
    title: reward.title,
    description: reward.description,
    image: reward.image,
    discount_type: reward.discount_type || 'FLAT',
    discount_value: reward.discount_value != null ? parseFloat(reward.discount_value) : 0,
    min_order_value: reward.min_order_value != null ? parseFloat(reward.min_order_value) : 0,
    max_discount_amount: reward.max_discount_amount != null ? parseFloat(reward.max_discount_amount) : null,
    valid_to: cr.expires_at,
    status: 'ACTIVE',
    is_personal_reward: true,
    customer_reward_id: cr.id,
    brand_name: reward.brand_name,
  };
}

exports.validate = async (req, res, next) => {
  try {
    const { code, order_amount } = req.body;
    if (!code) throw new AppError('Coupon code is required', 400);

    const normalizedCode = code.trim().toUpperCase();
    const now = new Date();
    const orderTotal = order_amount != null ? parseFloat(order_amount) : null;

    // 1. Check public Coupon catalog first
    const coupon = await Coupon.findOne({
      where: { code: normalizedCode, status: 'ACTIVE', is_active: true },
    });

    if (coupon) {
      if (now < new Date(coupon.valid_from) || now > new Date(coupon.valid_to)) {
        throw new AppError('Coupon has expired or is not yet active', 400);
      }

      if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) {
        throw new AppError('Coupon usage limit reached', 400);
      }

      const calc = calculateVoucherDiscount({
        discountType: coupon.discount_type,
        discountValue: coupon.discount_value,
        orderAmount: orderTotal,
        minOrderValue: coupon.min_order_value,
        maxDiscountAmount: coupon.max_discount_amount,
      });

      if (!calc.eligible) {
        throw new AppError(calc.reason, 400);
      }

      return res.json({
        valid: true,
        source: 'COUPON',
        coupon,
        discount_amount: calc.discountAmount,
        final_total: calc.finalTotal,
      });
    }

    // 2. Fallback: Check logged-in customer's claimed internal SALON_DISCOUNT reward voucher
    if (req.user?.id) {
      const customer = await Customer.findOne({ where: { user_id: req.user.id } });
      if (customer) {
        const personalReward = await CustomerReward.findOne({
          where: {
            customer_id: customer.id,
            status: 'CLAIMED',
            [Op.or]: [
              { issued_code: normalizedCode },
              { '$reward.reward_code$': normalizedCode },
            ],
          },
          include: [
            {
              model: Reward,
              as: 'reward',
              required: true,
              where: { reward_type: 'SALON_DISCOUNT' },
            },
          ],
          order: [['expires_at', 'ASC']],
        });

        if (personalReward) {
          if (new Date(personalReward.expires_at) < now) {
            personalReward.status = 'EXPIRED';
            await personalReward.save();
            throw new AppError('This reward voucher has expired', 400);
          }

          const mapped = mapPersonalRewardToCoupon(personalReward);
          if (!mapped.discount_value || mapped.discount_value <= 0) {
            throw new AppError('This reward voucher does not have a valid discount configured', 400);
          }

          const calc = calculateVoucherDiscount({
            discountType: mapped.discount_type,
            discountValue: mapped.discount_value,
            orderAmount: orderTotal,
            minOrderValue: mapped.min_order_value,
            maxDiscountAmount: mapped.max_discount_amount,
          });

          if (!calc.eligible) {
            throw new AppError(calc.reason, 400);
          }

          return res.json({
            valid: true,
            source: 'REWARD',
            customer_reward_id: personalReward.id,
            coupon: mapped,
            discount_amount: calc.discountAmount,
            final_total: calc.finalTotal,
          });
        }
      }
    }

    throw new AppError('Invalid or already redeemed coupon code', 404);
  } catch (err) {
    next(err);
  }
};

// Customer Mobile App: List active public coupons + customer's unlocked internal next-booking vouchers
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

    const eligibleCoupons = coupons
      .filter((c) => !c.usage_limit || c.used_count < c.usage_limit)
      .map((c) => ({ ...c.toJSON(), is_personal_reward: false }));

    let personalVouchers = [];
    if (req.user?.id) {
      const customer = await Customer.findOne({ where: { user_id: req.user.id } });
      if (customer) {
        const claimedRewards = await CustomerReward.findAll({
          where: {
            customer_id: customer.id,
            status: 'CLAIMED',
            expires_at: { [Op.gte]: now },
          },
          include: [
            {
              model: Reward,
              as: 'reward',
              required: true,
              where: {
                reward_type: 'SALON_DISCOUNT',
                discount_value: { [Op.gt]: 0 },
              },
            },
          ],
          order: [['expires_at', 'ASC']],
        });
        personalVouchers = claimedRewards.map(mapPersonalRewardToCoupon);
      }
    }

    // Show personal unlocked next-booking vouchers first, then public coupons
    res.json({ data: [...personalVouchers, ...eligibleCoupons] });
  } catch (err) {
    next(err);
  }
};
