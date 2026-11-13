const { Reward, CustomerReward, Customer, Booking, Salon, User } = require('../models');
const AppError = require('../middlewares/AppError');
const { genericQuery } = require('../services/genericQueryService');
const { rewardRegistryByKey } = require('../config/columnRegistry');
const { sendToUserAsync } = require('../services/pushNotificationService');
const { Op } = require('sequelize');

const defaultColumns = ['brand_name', 'title', 'reward_code', 'reward_type', 'validity_days', 'status', 'created_at'];

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
      reward_type,
      validity_days,
      status,
    } = req.body;

    if (!title || !description || !brand_name || !reward_code) {
      throw new AppError('title, description, brand_name, and reward_code are required', 400);
    }

    let imageUrl = req.body.image || null;
    if (req.file) {
      imageUrl = `/api/uploads/rewards/${req.file.filename}`;
    }

    const row = await Reward.create({
      title: title.trim(),
      description: description.trim(),
      brand_name: brand_name.trim(),
      reward_code: reward_code.trim().toUpperCase(),
      external_url: external_url?.trim() || null,
      image: imageUrl,
      reward_type: reward_type || 'PARTNER_OFFER',
      validity_days: validity_days ? parseInt(validity_days, 10) : 7,
      status: status || 'ACTIVE',
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

    const fields = [
      'title',
      'description',
      'brand_name',
      'reward_code',
      'external_url',
      'reward_type',
      'validity_days',
      'status',
    ];

    for (const f of fields) {
      if (req.body[f] !== undefined) {
        if (f === 'reward_code') row[f] = req.body[f].trim().toUpperCase();
        else if (f === 'validity_days') row[f] = parseInt(req.body[f], 10) || 7;
        else row[f] = req.body[f];
      }
    }

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
    row.status = 'INACTIVE';
    row.is_active = false;
    row.updated_by = req.user.id;
    await row.save();
    res.json({ success: true, message: 'Reward deactivated successfully' });
  } catch (err) {
    next(err);
  }
};

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
          attributes: ['id', 'title', 'description', 'brand_name', 'image', 'reward_code', 'external_url', 'reward_type'],
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
        const item = cr.toJSON();

        // Auto-expire if past expiry date and still unclaimed
        if (item.status === 'UNCLAIMED' && new Date(item.expires_at) < now) {
          cr.status = 'EXPIRED';
          await cr.save();
          item.status = 'EXPIRED';
        }

        // Mask code if unclaimed to preserve scratch-card mystery
        if (item.status === 'UNCLAIMED' && item.reward) {
          item.reward.reward_code = '••••••••';
        }

        return item;
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
        },
        {
          model: Booking,
          as: 'booking',
          attributes: ['id', 'booking_number', 'booking_date'],
          include: [{ model: Salon, as: 'salon', attributes: ['id', 'salon_name'] }],
        },
      ],
    });

    if (!cr) throw new AppError('Reward not found', 404);

    const now = new Date();
    if (new Date(cr.expires_at) < now) {
      cr.status = 'EXPIRED';
      await cr.save();
      throw new AppError('This reward has expired and can no longer be claimed', 400);
    }

    if (cr.status === 'UNCLAIMED') {
      cr.status = 'CLAIMED';
      cr.claimed_at = now;
      await cr.save();
    }

    res.json({
      success: true,
      data: cr,
      message: 'Reward claimed successfully! Enjoy your exclusive voucher.',
    });
  } catch (err) {
    next(err);
  }
};

// Automatic Trigger: Awards a mystery reward when booking transitions to COMPLETED
exports.awardMysteryReward = async (bookingId) => {
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
      ],
    });

    if (!booking || !booking.customer) return null;

    // Check if customer already has a reward for this booking (prevent duplicates)
    const existing = await CustomerReward.findOne({ where: { booking_id: booking.id } });
    if (existing) return existing;

    // Pick active rewards
    const activeRewards = await Reward.findAll({
      where: { status: 'ACTIVE', is_active: true },
    });

    if (activeRewards.length === 0) return null;

    // Select random reward
    const randomIndex = Math.floor(Math.random() * activeRewards.length);
    const selectedReward = activeRewards[randomIndex];

    const validityDays = selectedReward.validity_days || 7;
    const expiresAt = new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000);

    const customerReward = await CustomerReward.create({
      customer_id: booking.customer.id,
      booking_id: booking.id,
      reward_id: selectedReward.id,
      status: 'UNCLAIMED',
      unlocked_at: new Date(),
      expires_at: expiresAt,
    });

    // Send In-App & Push Notification to Customer
    const userId = booking.customer.user?.id;
    if (userId) {
      sendToUserAsync(userId, {
        type: 'REWARD_UNLOCKED',
        title: '🎉 Mystery Reward Unlocked!',
        body: `Congratulations! You unlocked an exclusive reward from ${selectedReward.brand_name} for completing your appointment at ${booking.salon?.salon_name || 'the salon'}. Scratch to reveal!`,
        data: {
          type: 'REWARD_UNLOCKED',
          customer_reward_id: customerReward.id,
          brand: selectedReward.brand_name,
        },
      });
    }

    return customerReward;
  } catch (err) {
    console.error('[Reward] awardMysteryReward error:', err.message);
    return null;
  }
};

