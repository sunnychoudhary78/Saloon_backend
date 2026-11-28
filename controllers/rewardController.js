const {
  Reward,
  CustomerReward,
  Customer,
  Booking,
  Service,
  Payment,
  Salon,
  User,
  sequelize,
} = require('../models');
const AppError = require('../middlewares/AppError');
const { genericQuery } = require('../services/genericQueryService');
const { rewardRegistryByKey } = require('../config/columnRegistry');
const { sendToUserAsync } = require('../services/pushNotificationService');
const {
  computeVisitAmount,
  selectRewardForVisit,
  generateIssuedCode,
} = require('../services/rewardSelectionService');
const { Op } = require('sequelize');

const defaultColumns = [
  'brand_name',
  'title',
  'reward_type',
  'min_booking_amount',
  'max_booking_amount',
  'max_claims_per_customer',
  'issued_count',
  'total_quantity',
  'status',
  'created_at',
];

function parseOptionalNumber(val) {
  if (val === undefined || val === null || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function parseOptionalInt(val) {
  if (val === undefined || val === null || val === '') return null;
  const n = parseInt(val, 10);
  return Number.isFinite(n) ? n : null;
}

function validateAndNormalizeRewardPayload(body, existing = null) {
  const rewardType = body.reward_type !== undefined
    ? body.reward_type
    : (existing?.reward_type || 'PARTNER_OFFER');

  const minBookingAmount = body.min_booking_amount !== undefined
    ? (parseOptionalNumber(body.min_booking_amount) ?? 0)
    : Number(existing?.min_booking_amount ?? 0);

  if (minBookingAmount < 0) {
    throw new AppError('Minimum booking amount cannot be negative', 400);
  }

  const maxBookingAmount = body.max_booking_amount !== undefined
    ? parseOptionalNumber(body.max_booking_amount)
    : (existing?.max_booking_amount != null ? Number(existing.max_booking_amount) : null);

  if (maxBookingAmount !== null && maxBookingAmount < minBookingAmount) {
    throw new AppError('Maximum booking amount must be greater than or equal to minimum booking amount', 400);
  }

  const maxClaimsPerCustomer = body.max_claims_per_customer !== undefined
    ? parseOptionalInt(body.max_claims_per_customer)
    : (existing ? existing.max_claims_per_customer : 1);

  if (maxClaimsPerCustomer !== null && maxClaimsPerCustomer < 1) {
    throw new AppError('Per-user cap must be at least 1 (or leave empty for unlimited)', 400);
  }

  const totalQuantity = body.total_quantity !== undefined
    ? parseOptionalInt(body.total_quantity)
    : (existing ? existing.total_quantity : null);

  if (totalQuantity !== null && totalQuantity < 1) {
    throw new AppError('Total vouchers must be at least 1 (or leave empty for unlimited)', 400);
  }

  // Internal next-booking voucher discount rules
  let discountType = body.discount_type !== undefined
    ? (body.discount_type || null)
    : (existing?.discount_type || null);
  let discountValue = body.discount_value !== undefined
    ? parseOptionalNumber(body.discount_value)
    : (existing?.discount_value != null ? Number(existing.discount_value) : null);
  let minOrderValue = body.min_order_value !== undefined
    ? (parseOptionalNumber(body.min_order_value) ?? 0)
    : Number(existing?.min_order_value ?? 0);
  let maxDiscountAmount = body.max_discount_amount !== undefined
    ? parseOptionalNumber(body.max_discount_amount)
    : (existing?.max_discount_amount != null ? Number(existing.max_discount_amount) : null);

  if (rewardType === 'SALON_DISCOUNT') {
    if (!discountType || !['FLAT', 'PERCENT'].includes(discountType)) {
      throw new AppError('Discount type (FLAT or PERCENT) is required for Salon Discount vouchers', 400);
    }
    if (discountValue == null || discountValue <= 0) {
      throw new AppError('Discount value must be greater than 0 for Salon Discount vouchers', 400);
    }
    if (discountType === 'PERCENT' && discountValue > 100) {
      throw new AppError('Percentage discount cannot exceed 100%', 400);
    }
    if (minOrderValue < 0) {
      throw new AppError('Minimum order value cannot be negative', 400);
    }
    if (maxDiscountAmount !== null && maxDiscountAmount <= 0) {
      throw new AppError('Max discount cap must be greater than 0', 400);
    }
  } else {
    discountType = null;
    discountValue = null;
    minOrderValue = 0;
    maxDiscountAmount = null;
  }

  return {
    reward_type: rewardType,
    min_booking_amount: minBookingAmount,
    max_booking_amount: maxBookingAmount,
    max_claims_per_customer: maxClaimsPerCustomer,
    total_quantity: totalQuantity,
    discount_type: discountType,
    discount_value: discountValue,
    min_order_value: minOrderValue,
    max_discount_amount: maxDiscountAmount,
  };
}

// Admin: Query rewards with filters, pagination and sorting
exports.query = async (req, res, next) => {
  try {
    const result = await genericQuery(Reward, req, 'rewards', defaultColumns, rewardRegistryByKey);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

// Admin: Create master reward template
exports.create = async (req, res, next) => {
  try {
    const {
      title,
      description,
      brand_name,
      reward_code,
      external_url,
      validity_days,
      status,
    } = req.body;

    if (!title || !description || !brand_name || !reward_code) {
      throw new AppError('title, description, brand_name, and reward_code are required', 400);
    }

    const normalized = validateAndNormalizeRewardPayload(req.body, null);

    let imageUrl = req.body.image || null;
    if (req.file) {
      imageUrl = `/api/uploads/rewards/${req.file.filename}`;
    }

    const resolvedStatus = status || 'ACTIVE';

    const row = await Reward.create({
      title: title.trim(),
      description: description.trim(),
      brand_name: brand_name.trim(),
      reward_code: reward_code.trim().toUpperCase(),
      external_url: external_url?.trim() || null,
      image: imageUrl,
      validity_days: validity_days ? parseInt(validity_days, 10) : 7,
      status: resolvedStatus,
      is_active: resolvedStatus === 'ACTIVE',
      ...normalized,
      created_by: req.user.id,
      updated_by: req.user.id,
    });

    res.status(201).json({ data: row });
  } catch (err) {
    next(err);
  }
};

// Admin: Update master reward template
exports.update = async (req, res, next) => {
  try {
    const row = await Reward.findByPk(req.params.id);
    if (!row) throw new AppError('Reward not found', 404);

    // If only toggling status (e.g., Activate/Deactivate button), skip full discount validation
    const bodyKeys = Object.keys(req.body || {});
    const isStatusOnlyUpdate = bodyKeys.length === 1 && bodyKeys[0] === 'status' && !req.file;

    if (isStatusOnlyUpdate) {
      row.status = req.body.status;
      row.is_active = req.body.status === 'ACTIVE';
      row.updated_by = req.user.id;
      await row.save();
      return res.json({ data: row });
    }

    const normalized = validateAndNormalizeRewardPayload(req.body, row);

    const basicFields = ['title', 'description', 'brand_name', 'reward_code', 'external_url', 'validity_days', 'status'];
    for (const f of basicFields) {
      if (req.body[f] !== undefined) {
        if (f === 'reward_code') row[f] = req.body[f].trim().toUpperCase();
        else if (f === 'validity_days') row[f] = parseInt(req.body[f], 10) || 7;
        else if (f === 'status') {
          row.status = req.body.status;
          row.is_active = req.body.status === 'ACTIVE';
        } else if (f === 'external_url') {
          row[f] = req.body[f]?.trim() || null;
        } else {
          row[f] = typeof req.body[f] === 'string' ? req.body[f].trim() : req.body[f];
        }
      }
    }

    Object.assign(row, normalized);

    if (req.file) {
      row.image = `/api/uploads/rewards/${req.file.filename}`;
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

// Admin: Delete reward
exports.delete = async (req, res, next) => {
  try {
    const row = await Reward.findByPk(req.params.id);
    if (!row) throw new AppError('Reward not found', 404);

    const claimedCount = await CustomerReward.count({ where: { reward_id: row.id } });
    if (claimedCount > 0) {
      row.status = 'INACTIVE';
      row.is_active = false;
      row.updated_by = req.user.id;
      await row.save();
      return res.json({ success: true, message: 'Reward deactivated because it was already awarded to customers' });
    }

    await row.destroy();
    res.json({ success: true, message: 'Reward deleted successfully' });
  } catch (err) {
    next(err);
  }
};

const REWARD_PUBLIC_ATTRIBUTES = [
  'id',
  'title',
  'description',
  'brand_name',
  'image',
  'reward_code',
  'external_url',
  'reward_type',
  'discount_type',
  'discount_value',
  'min_order_value',
  'max_discount_amount',
];

function formatCustomerRewardForApp(crInstance) {
  const item = typeof crInstance.toJSON === 'function' ? crInstance.toJSON() : { ...crInstance };
  const effectiveCode = item.issued_code || item.reward?.reward_code || '';

  if (item.status === 'UNCLAIMED') {
    item.issued_code = '••••••••';
    if (item.reward) {
      item.reward.reward_code = '••••••••';
    }
  } else {
    item.issued_code = effectiveCode;
    if (item.reward) {
      item.reward.reward_code = effectiveCode;
    }
  }

  return item;
}

// Customer: Get all rewards assigned to this customer
exports.getMyRewards = async (req, res, next) => {
  try {
    const customer = await Customer.findOne({ where: { user_id: req.user.id } });
    if (!customer) throw new AppError('Customer profile not found', 404);

    const rewards = await CustomerReward.findAll({
      where: { customer_id: customer.id },
      include: [
        {
          model: Reward,
          as: 'reward',
          attributes: REWARD_PUBLIC_ATTRIBUTES,
        },
        {
          model: Booking,
          as: 'booking',
          attributes: ['id', 'booking_number', 'booking_date'],
          include: [{ model: Salon, as: 'salon', attributes: ['id', 'salon_name'] }],
        },
      ],
      order: [['unlocked_at', 'DESC']],
    });

    const now = new Date();
    const formatted = await Promise.all(
      rewards.map(async (cr) => {
        // Auto-expire if past expiry date and not yet redeemed
        if ((cr.status === 'UNCLAIMED' || cr.status === 'CLAIMED') && new Date(cr.expires_at) < now) {
          cr.status = 'EXPIRED';
          await cr.save();
        }
        return formatCustomerRewardForApp(cr);
      })
    );

    res.json({ data: formatted });
  } catch (err) {
    next(err);
  }
};

// Customer: Scratch / Claim a reward
exports.claimReward = async (req, res, next) => {
  try {
    const customer = await Customer.findOne({ where: { user_id: req.user.id } });
    if (!customer) throw new AppError('Customer profile not found', 404);

    const cr = await CustomerReward.findOne({
      where: { id: req.params.id, customer_id: customer.id },
      include: [
        {
          model: Reward,
          as: 'reward',
          attributes: REWARD_PUBLIC_ATTRIBUTES,
        },
      ],
    });

    if (!cr) throw new AppError('Reward not found', 404);

    const now = new Date();
    if (cr.status === 'EXPIRED' || (cr.status !== 'REDEEMED' && new Date(cr.expires_at) < now)) {
      if (cr.status !== 'EXPIRED') {
        cr.status = 'EXPIRED';
        await cr.save();
      }
      throw new AppError('This mystery reward has expired', 400);
    }

    if (cr.status === 'UNCLAIMED') {
      cr.status = 'CLAIMED';
      cr.claimed_at = now;
      await cr.save();
    }

    res.json({
      success: true,
      data: formatCustomerRewardForApp(cr),
      message: 'Reward claimed successfully! Enjoy your exclusive voucher.',
    });
  } catch (err) {
    next(err);
  }
};

// Automatic Trigger: Awards a slab-matched, priority-weighted, usage-capped mystery reward when a visit completes
exports.awardMysteryReward = async (bookingId) => {
  const t = await sequelize.transaction();
  let committed = false;
  let notificationPayload = null;
  let notificationUserId = null;

  try {
    const booking = await Booking.findByPk(bookingId, {
      include: [
        {
          model: Customer,
          as: 'customer',
          include: [{ model: User, as: 'user', attributes: ['id', 'name'] }],
        },
        {
          model: Salon,
          as: 'salon',
          attributes: ['id', 'salon_name'],
        },
        {
          model: Service,
          as: 'service',
          attributes: ['id', 'service_name', 'price', 'discount_price'],
        },
      ],
      transaction: t,
    });

    if (!booking || !booking.customer) {
      await t.rollback();
      return null;
    }

    const groupId = booking.booking_group_id || booking.id;

    // Prevent duplicate awards for the same booking or multi-service visit group
    const existing = await CustomerReward.findOne({
      where: {
        [Op.or]: [
          { booking_id: booking.id },
          { booking_group_id: groupId },
        ],
      },
      transaction: t,
    });
    if (existing) {
      await t.rollback();
      const fullExisting = await CustomerReward.findByPk(existing.id, {
        include: [
          {
            model: Reward,
            as: 'reward',
            attributes: REWARD_PUBLIC_ATTRIBUTES,
          },
          {
            model: Booking,
            as: 'booking',
            attributes: ['id', 'booking_number', 'booking_date'],
            include: [{ model: Salon, as: 'salon', attributes: ['id', 'salon_name'] }],
          },
        ],
      });
      return fullExisting || existing;
    }

    // Load all bookings in this visit group and any paid payments to determine exact visit spend
    const groupBookings = booking.booking_group_id
      ? await Booking.findAll({
          where: { booking_group_id: booking.booking_group_id },
          include: [{ model: Service, as: 'service', attributes: ['id', 'price', 'discount_price'] }],
          transaction: t,
        })
      : [booking];

    const groupPayments = await Payment.findAll({
      where: {
        [Op.or]: [
          { booking_group_id: groupId },
          { booking_id: { [Op.in]: groupBookings.map((b) => b.id) } },
        ],
      },
      transaction: t,
    });

    const visitAmount = computeVisitAmount(groupBookings, groupPayments);

    // Load customer's full past reward history to enforce per-customer usage caps (never repeat 1-time vouchers)
    const pastRewards = await CustomerReward.findAll({
      where: { customer_id: booking.customer.id },
      include: [{ model: Reward, as: 'reward', attributes: ['id', 'reward_code'] }],
      transaction: t,
    });

    const customerClaimCounts = {};
    const customerClaimedCodes = new Set();
    for (const pr of pastRewards) {
      customerClaimCounts[pr.reward_id] = (customerClaimCounts[pr.reward_id] || 0) + 1;
      if (pr.issued_code) customerClaimedCodes.add(String(pr.issued_code).trim().toUpperCase());
      if (pr.reward?.reward_code) {
        customerClaimedCodes.add(String(pr.reward.reward_code).trim().toUpperCase());
      }
    }

    // Fetch active reward templates
    let activeRewards = await Reward.findAll({
      where: { status: 'ACTIVE', is_active: true },
      transaction: t,
    });

    if (activeRewards.length === 0) {
      await t.rollback();
      return null;
    }

    // Attempt atomic selection + stock increment (retry up to 3 times if concurrent request depleted stock)
    let selectedReward = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const candidate = selectRewardForVisit({
        rewards: activeRewards.map((r) => (typeof r.toJSON === 'function' ? r.toJSON() : r)),
        visitAmount,
        customerClaimCounts,
        customerClaimedCodes,
      });

      if (!candidate) break;

      // Atomically claim 1 stock unit if stock is capped, or always increment issued_count
      const [updatedCount] = await Reward.update(
        { issued_count: sequelize.literal('issued_count + 1') },
        {
          where: {
            id: candidate.id,
            status: 'ACTIVE',
            is_active: true,
            [Op.or]: [
              { total_quantity: null },
              sequelize.where(sequelize.col('issued_count'), Op.lt, sequelize.col('total_quantity')),
            ],
          },
          transaction: t,
        }
      );

      if (updatedCount > 0) {
        selectedReward = candidate;
        break;
      }

      // Stock ran out concurrently — exclude this reward and try next eligible candidate
      activeRewards = activeRewards.filter((r) => r.id !== candidate.id);
    }

    if (!selectedReward) {
      await t.rollback();
      return null;
    }

    const validityDays = selectedReward.validity_days || 7;
    const expiresAt = new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000);
    const issuedCode = generateIssuedCode(selectedReward);

    const customerReward = await CustomerReward.create(
      {
        customer_id: booking.customer.id,
        booking_id: booking.id,
        booking_group_id: groupId,
        reward_id: selectedReward.id,
        visit_amount: visitAmount,
        issued_code: issuedCode,
        status: 'UNCLAIMED',
        unlocked_at: new Date(),
        expires_at: expiresAt,
      },
      { transaction: t }
    );

    await t.commit();
    committed = true;

    // Reload with associations for full reward detail
    const fullReward = await CustomerReward.findByPk(customerReward.id, {
      include: [
        {
          model: Reward,
          as: 'reward',
          attributes: REWARD_PUBLIC_ATTRIBUTES,
        },
        {
          model: Booking,
          as: 'booking',
          attributes: ['id', 'booking_number', 'booking_date'],
          include: [{ model: Salon, as: 'salon', attributes: ['id', 'salon_name'] }],
        },
      ],
    });

    notificationUserId = booking.customer.user?.id || null;
    if (notificationUserId) {
      const salonName = booking.salon?.salon_name || 'the salon';
      const isInternal = selectedReward.reward_type === 'SALON_DISCOUNT';
      notificationPayload = {
        type: 'REWARD_UNLOCKED',
        title: '🎉 Mystery Reward Unlocked!',
        body: isInternal
          ? `Congratulations! You unlocked a next-booking salon voucher (${selectedReward.title}) from your visit at ${salonName}. Scratch to reveal!`
          : `Congratulations! You unlocked an exclusive reward from ${selectedReward.brand_name} for your payment at ${salonName}. Scratch to reveal!`,
        data: {
          type: 'REWARD_UNLOCKED',
          screen: 'customer_rewards',
          customer_reward_id: customerReward.id,
          brand: selectedReward.brand_name,
          reward_type: selectedReward.reward_type,
          title: selectedReward.title,
        },
      };
      sendToUserAsync(notificationUserId, notificationPayload);
    }

    return fullReward || customerReward;
  } catch (err) {
    if (!committed) {
      await t.rollback().catch(() => {});
    }
    console.error('[Reward] awardMysteryReward error:', err.message);
    return null;
  }
};

exports.formatCustomerRewardForApp = formatCustomerRewardForApp;
