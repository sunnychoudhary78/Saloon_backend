const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const {
  User,
  Role,
  UserRole,
  SalonOwner,
  SalonApplication,
  Salon,
  Service,
  ServiceCategory,
  Customer,
  Booking,
  Review,
  Coupon,
  PromotionalBanner,
  Payment,
  sequelize,
} = require('../models');
const AppError = require('../middlewares/AppError');
const { generateToken, loadUserWithRoles, shapeUserResponse, getRoleNames } = require('../utils/authHelpers');
const { normalizePhoneDigits } = require('../utils/phoneUtils');
const { getSalonOwnerForUser, assertSalonOwnership } = require('../utils/ownershipGuard');
const { generateBookingNumber, canTransition } = require('../services/bookingService');
const {
  getSlotsForSalon,
  getOwnerSlotsForSalon,
  getTodayAvailabilitySummary,
  getBatchTodayAvailabilitySummaries,
  assertSlotBookable,
  assertAdditionalServiceBookable,
  setSlotBlocked,
  loadPremiumConfig,
  normalizeSlotStart,
} = require('../services/slotService');
const {
  notifyNewBooking,
  notifyBookingConfirmed,
  notifyBookingCancelledForOwner,
  notifyBookingRejected,
  notifyBookingCompleted,
  notifyPremiumPayment,
  notifyBookingPayment,
} = require('../services/bookingNotificationHelper');
const {
  attachRatingSummary,
  getBatchSalonRatingSummaries,
  isBookingReviewable,
  shapeBookingReviewFlags,
  shapePublicReview,
} = require('../services/reviewService');
const {
  generateSalonImageVariants,
  generateProfileImage,
  shapeGalleryForDetail,
  shapeCoverForDetail,
} = require('../services/imageProcessingService');
const {
  getBatchDiscountFlags,
  getSalonIdsWithActiveServices,
  shapeBrowseSalonDto,
  emptyRatingSummary,
  discountedSalonExistsLiteral,
  minRatingSalonExistsLiteral,
} = require('../services/salonBrowseService');
const {
  parseUserCoordinates,
  distanceKmSqlLiteral,
  attachDistance,
  shapeSalonDistanceFields,
} = require('../services/locationService');
const { logAudit } = require('../services/auditService');
const { normalizeApplicationType } = require('../services/salonApplicationService');
const { searchPlaces } = require('../services/geocodingService');
const {
  createOrReuseRazorpayOrder,
  createPremiumPaymentWindow,
  findLatestPayment,
  isExpired,
  markExpired,
  premiumPayableAmount,
  servicePayableAmount,
  shapePayment,
  splitPayments,
} = require('../services/paymentService');
const { verifyPaymentSignature } = require('../services/razorpayService');

function isSalonActive(salon) {
  return salon.status === 'ACTIVE' && salon.is_active === true;
}

function isTruthy(value) {
  return value === true || value === 'true' || value === '1';
}

function parseMoney(value, fieldName, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new AppError(`${fieldName} is required`, 400);
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new AppError(`${fieldName} must be a number`, 400);
  return parsed;
}

function paymentInclude() {
  return {
    model: Payment,
    as: 'payments',
    required: false,
    order: [['created_at', 'DESC']],
  };
}

function hasPremiumFee(booking) {
  const amount = Number(booking?.premium_amount);
  return Number.isFinite(amount) && amount > 0;
}

function ownerBookingDetailInclude() {
  return [
    {
      model: Customer,
      as: 'customer',
      include: [{ model: User, as: 'user', attributes: ['name', 'phone', 'email'] }],
    },
    { model: Service, as: 'service', attributes: ['id', 'service_name', 'price', 'discount_price'] },
    { model: Salon, as: 'salon', attributes: ['id', 'salon_name', 'city'] },
    paymentInclude(),
  ];
}

function shapeBookingWithPayments(booking) {
  const plain = typeof booking.get === 'function' ? booking.get({ plain: true }) : booking;
  const payments = (plain.payments || []).map((payment) => shapePayment(payment));
  const latest = splitPayments(payments);
  return {
    ...plain,
    payments,
    premium_payment: latest.premium_payment,
    salon_fee_payment: latest.salon_fee_payment,
  };
}

// Loads every booking that belongs to the same multi-service request (locked
// for update). Legacy rows without a group id resolve to just themselves.
async function loadBookingGroupForUpdate(primary, transaction) {
  if (!primary.booking_group_id) return [primary];
  return Booking.findAll({
    where: { booking_group_id: primary.booking_group_id },
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });
}

async function loadCustomerBookingForPayment(userId, bookingId, transaction = null) {
  const customer = await Customer.findOne({ where: { user_id: userId }, transaction });
  if (!customer) throw new AppError('Customer profile not found', 404);

  const booking = await Booking.findOne({
    where: { id: bookingId, customer_id: customer.id },
    include: [
      { model: Salon, as: 'salon', attributes: ['id', 'salon_name', 'city'] },
      { model: Service, as: 'service', attributes: ['id', 'service_name', 'price', 'discount_price'] },
      paymentInclude(),
    ],
    transaction,
    lock: transaction
      ? { level: transaction.LOCK.UPDATE, of: Booking }
      : undefined,
  });
  if (!booking) throw new AppError('Booking not found', 404);
  return { customer, booking };
}

function shapeDiscountSummary(json) {
  const discountedServices = (json.services || []).filter((service) => {
    const price = Number(service.price);
    const discountPrice = Number(service.discount_price);
    return Number.isFinite(price)
      && Number.isFinite(discountPrice)
      && discountPrice > 0
      && discountPrice < price;
  });

  json.has_discount = discountedServices.length > 0;
  json.discounted_services_count = discountedServices.length;
  json.max_savings_percent = discountedServices.reduce((max, service) => {
    const price = Number(service.price);
    const discountPrice = Number(service.discount_price);
    const savings = price > 0 ? Math.round(((price - discountPrice) / price) * 100) : 0;
    return Math.max(max, savings);
  }, 0);

  return json;
}

function buildOwnerServicePayload(body, existing = null) {
  const payload = {};

  if (body.category_id !== undefined) payload.category_id = body.category_id;
  if (body.service_name !== undefined) payload.service_name = String(body.service_name).trim();
  if (body.description !== undefined) {
    payload.description = body.description ? String(body.description).trim() : null;
  }
  if (body.duration_minutes !== undefined) {
    const duration = parseInt(body.duration_minutes, 10);
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new AppError('duration_minutes must be greater than 0', 400);
    }
    payload.duration_minutes = duration;
  }
  if (body.price !== undefined) {
    const price = parseMoney(body.price, 'price', { required: true });
    if (price <= 0) throw new AppError('price must be greater than 0', 400);
    payload.price = price;
  }
  if (body.discount_price !== undefined) {
    payload.discount_price = parseMoney(body.discount_price, 'discount_price');
  }
  if (body.status !== undefined) {
    if (!['ACTIVE', 'INACTIVE'].includes(body.status)) {
      throw new AppError('Invalid service status', 400);
    }
    payload.status = body.status;
  }

  if (!existing) {
    if (!payload.category_id) throw new AppError('category_id is required', 400);
    if (!payload.service_name) throw new AppError('service_name is required', 400);
    if (payload.price === undefined) throw new AppError('price is required', 400);
    if (payload.duration_minutes === undefined) payload.duration_minutes = 30;
    if (payload.status === undefined) payload.status = 'ACTIVE';
  }

  const effectivePrice = payload.price !== undefined ? payload.price : Number(existing?.price);
  if (payload.discount_price !== undefined && payload.discount_price !== null) {
    if (payload.discount_price <= 0) {
      throw new AppError('discount_price must be greater than 0', 400);
    }
    if (payload.discount_price >= effectivePrice) {
      throw new AppError('discount_price must be lower than price', 400);
    }
  }

  return payload;
}

function snapshotSalonForApplication(salon, payload) {
  return {
    ...payload,
    salon_name: salon.salon_name,
    address: salon.address,
    city: salon.city,
    state: salon.state,
    description: payload.description || null,
  };
}

async function assignRole(userId, roleName, assignedBy = null, transaction = null) {
  const role = await Role.findOne({ where: { name: roleName }, transaction });
  if (!role) throw new AppError(`Role ${roleName} not found`, 500);
  await UserRole.findOrCreate({
    where: { user_id: userId, role_id: role.id },
    defaults: { assigned_by: assignedBy, assigned_at: new Date() },
    transaction,
  });
}

async function loadSalonOwnerContext(userId) {
  const owner = await SalonOwner.findOne({ where: { user_id: userId } });
  let salon_application = null;
  if (owner) {
    const application = await SalonApplication.findOne({
      where: { owner_id: owner.id },
      order: [['created_at', 'DESC']],
    });
    if (application) {
      salon_application = {
        id: application.id,
        salon_name: application.salon_name,
        application_status: application.application_status,
        application_type: application.application_type || 'CREATE',
        salon_id: application.salon_id,
        rejection_reason: application.rejection_reason,
        created_at: application.created_at,
      };
    }
  }
  return { salon_owner: owner, salon_application };
}

exports.getProfile = async (req, res, next) => {
  try {
    const user = await loadUserWithRoles(req.user.id);
    const customer = await Customer.findOne({ where: { user_id: req.user.id } });
    const { salon_owner, salon_application } = await loadSalonOwnerContext(req.user.id);
    res.json({
      user: shapeUserResponse(user),
      customer,
      salon_owner,
      salon_application,
    });
  } catch (err) {
    next(err);
  }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id);
    const { name, phone, email } = req.body;
    if (name) user.name = name;
    if (phone !== undefined) {
      if (phone === null || phone === '') {
        user.phone = null;
      } else {
        const normalizedPhone = normalizePhoneDigits(phone);
        if (!normalizedPhone) {
          throw new AppError('Phone must be exactly 10 digits', 400);
        }
        user.phone = normalizedPhone;
      }
    }
    if (email !== undefined) {
      const normalizedEmail = email && String(email).trim()
        ? String(email).trim().toLowerCase()
        : null;
      if (normalizedEmail) {
        const exists = await User.findOne({
          where: { email: normalizedEmail, id: { [Op.ne]: user.id } },
        });
        if (exists) throw new AppError('Email already in use', 409);
      }
      user.email = normalizedEmail;
    }
    user.updated_by = req.user.id;
    await user.save();

    const customer = await Customer.findOne({ where: { user_id: req.user.id } });
    if (customer) {
      const { profile_image, gender, dob } = req.body;
      if (profile_image !== undefined) customer.profile_image = profile_image;
      if (gender !== undefined) customer.gender = gender;
      if (dob !== undefined) customer.dob = dob;
      customer.updated_by = req.user.id;
      await customer.save();
    }

    const fullUser = await loadUserWithRoles(user.id);
    const { salon_owner, salon_application } = await loadSalonOwnerContext(user.id);
    res.json({
      user: shapeUserResponse(fullUser),
      customer,
      salon_owner,
      salon_application,
    });
  } catch (err) {
    next(err);
  }
};

exports.registerSalonOwner = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const { business_name, gst_number } = req.body;
    if (!business_name) throw new AppError('business_name is required', 400);

    const existing = await SalonOwner.findOne({ where: { user_id: req.user.id } });
    if (existing) throw new AppError('Already registered as salon owner', 409);

    await assignRole(req.user.id, 'SALON_OWNER', req.user.id, t);
    const owner = await SalonOwner.create(
      {
        user_id: req.user.id,
        business_name,
        gst_number: gst_number || null,
        status: 'ACTIVE',
        created_by: req.user.id,
        updated_by: req.user.id,
      },
      { transaction: t }
    );

    await t.commit();
    res.status(201).json({ data: owner });
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

exports.submitSalonApplication = async (req, res, next) => {
  try {
    const owner = await getSalonOwnerForUser(req.user.id);
    if (!owner) throw new AppError('Register as salon owner first', 403);

    const applicationType = normalizeApplicationType(req.body.application_type || 'CREATE');
    const salonId = req.body.salon_id || null;
    let payload = { ...req.body, application_type: applicationType };

    if (applicationType === 'UPDATE' || applicationType === 'DEACTIVATE' || applicationType === 'ACTIVATE') {
      const { salon } = await assertSalonOwnership(req.user.id, salonId);

      const pending = await SalonApplication.findOne({
        where: {
          salon_id: salonId,
          application_status: 'PENDING_APPROVAL',
        },
      });
      if (pending) {
        throw new AppError('A change request for this salon is already pending approval', 409);
      }

      if (applicationType === 'DEACTIVATE') {
        if (!isSalonActive(salon)) {
          throw new AppError('This salon is already deactivated', 400);
        }
        payload = snapshotSalonForApplication(salon, payload);
      } else if (applicationType === 'ACTIVATE') {
        if (isSalonActive(salon)) {
          throw new AppError('This salon is already active', 400);
        }
        payload = snapshotSalonForApplication(salon, payload);
      }
    } else {
      const pendingCreate = await SalonApplication.findOne({
        where: {
          owner_id: owner.id,
          application_type: 'CREATE',
          application_status: 'PENDING_APPROVAL',
        },
      });
      if (pendingCreate) {
        throw new AppError('You already have a pending salon creation application', 409);
      }
    }

    const application = await SalonApplication.create({
      owner_id: owner.id,
      ...payload,
      application_status: 'PENDING_APPROVAL',
      created_by: req.user.id,
      updated_by: req.user.id,
    });

    await logAudit({ userId: req.user.id, action: 'salonApplication.submit', entityType: 'SalonApplication', entityId: application.id, req });
    res.status(201).json({ data: application });
  } catch (err) {
    next(err);
  }
};

exports.getOwnerSalonApplications = async (req, res, next) => {
  try {
    const owner = await getSalonOwnerForUser(req.user.id);
    if (!owner) throw new AppError('Salon owner profile not found', 404);

    const where = { owner_id: owner.id };
    if (req.query.status) where.application_status = req.query.status;

    const applications = await SalonApplication.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit: Math.min(parseInt(req.query.limit, 10) || 50, 100),
    });

    res.json({ data: applications });
  } catch (err) {
    next(err);
  }
};

exports.browseSalons = async (req, res, next) => {
  try {
    const where = { status: 'ACTIVE', is_active: true };
    const featuredOnly = isTruthy(req.query.featured);
    const discountedOnly = isTruthy(req.query.has_discount);
    const userCoords = parseUserCoordinates(req.query);
    const minRating = parseFloat(req.query.min_rating);
    const maxDistanceKm = parseFloat(req.query.max_distance_km);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
    const offset = parseInt(req.query.offset, 10) || 0;

    if (req.query.city) where.city = { [Op.iLike]: `%${req.query.city}%` };
    if (featuredOnly) where.is_featured = true;
    if (req.query.search) {
      where[Op.or] = [
        { salon_name: { [Op.iLike]: `%${req.query.search}%` } },
        { city: { [Op.iLike]: `%${req.query.search}%` } },
      ];
    }

    const idFilters = [];
    if (discountedOnly) {
      idFilters.push({ id: { [Op.in]: discountedSalonExistsLiteral(sequelize) } });
    }
    if (Number.isFinite(minRating)) {
      idFilters.push({ id: { [Op.in]: minRatingSalonExistsLiteral(sequelize, minRating) } });
    }
    if (idFilters.length === 1) {
      Object.assign(where, idFilters[0]);
    } else if (idFilters.length > 1) {
      where[Op.and] = [...(where[Op.and] || []), ...idFilters];
    }

    const distanceLiteral = userCoords
      ? distanceKmSqlLiteral(sequelize, userCoords.userLat, userCoords.userLng)
      : null;

    if (userCoords && Number.isFinite(maxDistanceKm)) {
      where[Op.and] = [
        ...(where[Op.and] || []),
        sequelize.where(distanceLiteral, { [Op.lte]: maxDistanceKm }),
        sequelize.where(distanceLiteral, { [Op.ne]: null }),
      ];
    }

    const order = featuredOnly
      ? [['featured_sort_order', 'ASC'], ['salon_name', 'ASC']]
      : discountedOnly
        ? [['salon_name', 'ASC']]
        : userCoords
          ? [[distanceLiteral, 'ASC NULLS LAST']]
          : [['salon_name', 'ASC']];

    const baseAttributes = [
      'id',
      'salon_name',
      'city',
      'address',
      'cover_image',
      'gallery_images',
      'latitude',
      'longitude',
      'opening_time',
      'closing_time',
      'is_featured',
    ];

    const findOptions = {
      where,
      distinct: true,
      subQuery: false,
      order,
      limit,
      offset,
      attributes: userCoords
        ? { include: [[distanceLiteral, 'distance_km']] }
        : baseAttributes,
    };

    const { count, rows: salons } = await Salon.findAndCountAll(findOptions);
    const salonIds = salons.map((salon) => salon.id);

    const [
      ratingMap,
      slotsMap,
      discountMap,
      serviceSalonIds,
    ] = await Promise.all([
      getBatchSalonRatingSummaries(salonIds),
      getBatchTodayAvailabilitySummaries(salons.map((salon) => salon.get({ plain: true }))),
      getBatchDiscountFlags(salonIds),
      getSalonIdsWithActiveServices(salonIds),
    ]);

    const data = salons.map((salon) => {
      const salonJson = salon.get({ plain: true });
      if (userCoords) {
        attachDistance(salonJson, userCoords.userLat, userCoords.userLng);
      } else {
        shapeSalonDistanceFields(salonJson);
      }

      return shapeBrowseSalonDto(salonJson, {
        ratingSummary: ratingMap.get(salon.id) || emptyRatingSummary(),
        slotsToday: slotsMap.get(salon.id) || { total: 0, available: 0, status: 'unknown' },
        discountFlags: discountMap.get(salon.id) || {
          has_discount: false,
          discounted_services_count: 0,
          max_savings_percent: 0,
        },
        hasServices: serviceSalonIds.has(salon.id),
        userCoords,
      });
    });

    res.json({
      data,
      meta: {
        total: count,
        limit,
        offset,
        has_more: offset + data.length < count,
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.getSalonSlots = async (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date) throw new AppError('date query parameter is required (YYYY-MM-DD)', 400);
    const data = await getSlotsForSalon(req.params.id, date);
    res.json({ data });
  } catch (err) {
    next(err);
  }
};

exports.getPremiumBookingConfig = async (req, res, next) => {
  try {
    const config = await loadPremiumConfig();
    res.json({ data: config });
  } catch (err) {
    next(err);
  }
};

exports.getSalon = async (req, res, next) => {
  try {
    const salon = await Salon.findOne({
      where: { id: req.params.id, status: 'ACTIVE', is_active: true },
      include: [{
        model: Service,
        as: 'services',
        where: { status: 'ACTIVE' },
        required: false,
        include: [{ model: ServiceCategory, as: 'category', attributes: ['id', 'name'] }],
      }],
    });
    if (!salon) throw new AppError('Salon not found', 404);
    const userCoords = parseUserCoordinates(req.query);
    let data = await attachRatingSummary(salon.toJSON());
    data = userCoords
      ? attachDistance(data, userCoords.userLat, userCoords.userLng)
      : shapeSalonDistanceFields(data);
    data.cover_image = shapeCoverForDetail(data.cover_image, data.gallery_images);
    data.gallery_images = shapeGalleryForDetail(data.gallery_images);
    data = shapeDiscountSummary(data);
    res.json({ data });
  } catch (err) {
    next(err);
  }
};

exports.getSalonReviews = async (req, res, next) => {
  try {
    const salon = await Salon.findOne({
      where: { id: req.params.id, status: 'ACTIVE', is_active: true },
      attributes: ['id'],
    });
    if (!salon) throw new AppError('Salon not found', 404);

    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
    const offset = parseInt(req.query.offset, 10) || 0;

    const { count, rows } = await Review.findAndCountAll({
      where: { salon_id: salon.id, status: 'PUBLISHED' },
      include: [{
        model: Customer,
        as: 'customer',
        include: [{ model: User, as: 'user', attributes: ['name'] }],
      }],
      order: [['created_at', 'DESC']],
      limit,
      offset,
    });

    res.json({
      data: rows.map(shapePublicReview),
      meta: { total: count, limit, offset },
    });
  } catch (err) {
    next(err);
  }
};

exports.createBooking = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const customer = await Customer.findOne({ where: { user_id: req.user.id }, transaction: t });
    if (!customer) throw new AppError('Customer profile not found', 404);

    const {
      salon_id,
      service_id,
      service_ids: serviceIdsBody,
      booking_date,
      booking_time,
      notes,
      is_premium: isPremium,
    } = req.body;

    const serviceIds = Array.isArray(serviceIdsBody) && serviceIdsBody.length > 0
      ? [...new Set(serviceIdsBody)]
      : service_id
        ? [service_id]
        : [];

    if (!salon_id || serviceIds.length === 0 || !booking_date || !booking_time) {
      throw new AppError('salon_id, service_id or service_ids, booking_date, booking_time are required', 400);
    }

    const slotInfo = await assertSlotBookable(salon_id, booking_date, booking_time, {
      isPremium: Boolean(isPremium),
    });

    const normalizedTime = normalizeSlotStart(booking_time) || slotInfo.slotStart;
    const isPremiumBooking = slotInfo.bookingType === 'PREMIUM';
    // All services requested together share one group id so the salon can
    // accept/reject/cancel them as a single logical booking.
    const bookingGroupId = crypto.randomUUID();
    const createdBookings = [];

    for (let i = 0; i < serviceIds.length; i += 1) {
      const currentServiceId = serviceIds[i];

      const service = await Service.findOne({
        where: { id: currentServiceId, salon_id, status: 'ACTIVE' },
        transaction: t,
      });
      if (!service) throw new AppError(`Service not found: ${currentServiceId}`, 404);

      if (i > 0) {
        await assertAdditionalServiceBookable(
          salon_id,
          booking_date,
          normalizedTime,
          currentServiceId,
          customer.id,
          { transaction: t }
        );
      }

      const booking = await Booking.create({
        booking_number: await generateBookingNumber(t),
        booking_group_id: bookingGroupId,
        customer_id: customer.id,
        salon_id,
        service_id: currentServiceId,
        booking_date,
        booking_time: normalizedTime,
        notes,
        booking_status: 'PENDING',
        // The premium (urgent) fee is charged once per slot on the primary
        // booking. Additional services in the same urgent request are STANDARD
        // so they aren't blocked behind a premium payment they don't owe.
        booking_type: isPremiumBooking && i === 0 ? 'PREMIUM' : 'STANDARD',
        premium_amount: isPremiumBooking && i === 0 ? slotInfo.premiumAmount : null,
        premium_payment_status: isPremiumBooking && i === 0 ? 'PENDING' : 'NONE',
        created_by: req.user.id,
        updated_by: req.user.id,
      }, { transaction: t });

      createdBookings.push(booking);
    }

    await t.commit();

    for (const booking of createdBookings) {
      await logAudit({
        userId: req.user.id,
        action: 'booking.request',
        entityType: 'Booking',
        entityId: booking.id,
        req,
      });
    }

    const fullBookings = await Booking.findAll({
      where: { id: createdBookings.map((b) => b.id) },
      include: [
        { model: Salon, as: 'salon', attributes: ['id', 'salon_name', 'city'] },
        { model: Service, as: 'service', attributes: ['id', 'service_name', 'price'] },
        paymentInclude(),
      ],
      order: [['created_at', 'ASC']],
    });

    res.status(201).json({
      data: fullBookings.length === 1
        ? shapeBookingWithPayments(fullBookings[0])
        : fullBookings.map(shapeBookingWithPayments),
    });

    for (const booking of fullBookings) {
      notifyNewBooking(booking.id);
    }
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

exports.getMyBookings = async (req, res, next) => {
  try {
    const customer = await Customer.findOne({ where: { user_id: req.user.id } });
    if (!customer) throw new AppError('Customer profile not found', 404);

    const bookings = await Booking.findAll({
      where: { customer_id: customer.id },
      include: [
        { model: Salon, as: 'salon', attributes: ['id', 'salon_name', 'city'] },
        { model: Service, as: 'service', attributes: ['id', 'service_name', 'price', 'discount_price', 'duration_minutes'] },
        { model: Review, as: 'review', required: false },
        paymentInclude(),
      ],
      order: [['booking_date', 'DESC'], ['booking_time', 'DESC']],
    });

    const data = bookings.map((booking) => {
      const plain = shapeBookingWithPayments(booking);
      const flags = shapeBookingReviewFlags(booking, plain.service, plain.review);
      return { ...plain, ...flags };
    });

    res.json({ data });
  } catch (err) {
    next(err);
  }
};

exports.cancelBooking = async (req, res, next) => {
  const t = await sequelize.transaction();
  let committed = false;
  try {
    const customer = await Customer.findOne({ where: { user_id: req.user.id }, transaction: t });
    if (!customer) throw new AppError('Customer profile not found', 404);
    const booking = await Booking.findOne({
      where: { id: req.params.id, customer_id: customer.id },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!booking) throw new AppError('Booking not found', 404);
    if (!canTransition(booking.booking_status, 'CANCELLED')) {
      throw new AppError('Booking cannot be cancelled', 400);
    }

    // Cancel every still-active service in the same request.
    const group = await loadBookingGroupForUpdate(booking, t);
    for (const item of group) {
      if (item.customer_id !== customer.id) continue;
      if (!canTransition(item.booking_status, 'CANCELLED')) continue;
      item.booking_status = 'CANCELLED';
      item.responded_by = req.user.id;
      item.responded_at = new Date();
      item.updated_by = req.user.id;
      await item.save({ transaction: t });
    }
    await t.commit();
    committed = true;
    notifyBookingCancelledForOwner(booking.id);
    res.json({ data: booking });
  } catch (err) {
    if (!committed) await t.rollback();
    next(err);
  }
};

exports.createRazorpayOrder = async (req, res, next) => {
  const t = await sequelize.transaction();
  let committed = false;
  try {
    const { booking_id: bookingId, payment_type: paymentType = 'SALON_FEE' } = req.body;
    if (!bookingId) throw new AppError('booking_id is required', 400);
    if (!['SALON_FEE', 'PREMIUM_FEE'].includes(paymentType)) {
      throw new AppError('Invalid payment_type', 400);
    }

    const { booking } = await loadCustomerBookingForPayment(req.user.id, bookingId, t);
    if (booking.booking_status !== 'ACCEPTED') {
      throw new AppError('Payment is available only after salon accepts the booking', 400);
    }

    let payment = await findLatestPayment(booking.id, paymentType, t);

    if (paymentType === 'PREMIUM_FEE') {
      if (booking.booking_type !== 'PREMIUM') throw new AppError('This is not a premium booking', 400);
      if (booking.premium_payment_status === 'PAID') throw new AppError('Premium fee is already paid', 409);

      if (!payment) {
        payment = await createPremiumPaymentWindow(booking, req.user.id, t);
      }
      if (isExpired(payment)) {
        await markExpired(payment, t);
        booking.premium_payment_status = 'FAILED';
        booking.updated_by = req.user.id;
        await booking.save({ transaction: t });
        throw new AppError('Premium payment window has expired', 400);
      }
      if (payment.status !== 'PENDING') {
        payment = await Payment.create({
          booking_id: booking.id,
          customer_id: booking.customer_id,
          salon_id: booking.salon_id,
          payment_type: 'PREMIUM_FEE',
          amount: premiumPayableAmount(booking),
          currency: 'INR',
          method: 'RAZORPAY',
          status: 'PENDING',
          expires_at: payment.expires_at,
          created_by: req.user.id,
          updated_by: req.user.id,
        }, { transaction: t });
      }
    } else {
      if (booking.booking_type === 'PREMIUM' && booking.premium_payment_status !== 'PAID') {
        throw new AppError('Pay the premium fee before salon fee payment', 400);
      }
      if (payment?.status === 'PAID') throw new AppError('Salon fee is already paid', 409);
      if (payment?.status === 'PENDING' && payment.method === 'PAY_AT_SHOP') {
        throw new AppError('Pay at shop is already selected for this booking', 409);
      }
      if (!payment || payment.status !== 'PENDING' || payment.method !== 'RAZORPAY') {
        payment = await Payment.create({
          booking_id: booking.id,
          customer_id: booking.customer_id,
          salon_id: booking.salon_id,
          payment_type: 'SALON_FEE',
          amount: servicePayableAmount(booking.service),
          currency: 'INR',
          method: 'RAZORPAY',
          status: 'PENDING',
          created_by: req.user.id,
          updated_by: req.user.id,
        }, { transaction: t });
      }
    }

    payment = await createOrReuseRazorpayOrder(payment, req.user.id, t);
    await t.commit();
    committed = true;

    res.status(201).json({ data: shapePayment(payment, { includeRazorpayKey: true }) });
  } catch (err) {
    if (!committed) await t.rollback();
    next(err);
  }
};

exports.verifyRazorpayPayment = async (req, res, next) => {
  const t = await sequelize.transaction();
  let committed = false;
  let notifyPremiumBookingId = null;
  let notifySalonFee = null;
  try {
    const {
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature,
    } = req.body;

    const payment = await Payment.findOne({
      where: { razorpay_order_id: orderId },
      include: [{
        model: Booking,
        as: 'booking',
        include: [
          { model: Salon, as: 'salon', attributes: ['id', 'salon_name', 'city'] },
          { model: Service, as: 'service', attributes: ['id', 'service_name', 'price', 'discount_price'] },
          paymentInclude(),
        ],
      }],
      transaction: t,
      lock: { level: t.LOCK.UPDATE, of: Payment },
    });
    if (!payment) throw new AppError('Payment order not found', 404);

    const customer = await Customer.findOne({ where: { user_id: req.user.id }, transaction: t });
    if (!customer || payment.customer_id !== customer.id) throw new AppError('Payment order not found', 404);

    await markExpired(payment, t);
    if (payment.status === 'EXPIRED') throw new AppError('Payment window has expired', 400);
    if (payment.status === 'PAID') {
      await t.commit();
      committed = true;
      return res.json({ data: shapePayment(payment), booking: shapeBookingWithPayments(payment.booking) });
    }
    if (payment.status !== 'PENDING') throw new AppError(`Payment is ${payment.status.toLowerCase()}`, 400);

    if (payment.booking.booking_status !== 'ACCEPTED') {
      throw new AppError('This booking is no longer active for payment', 400);
    }

    const valid = verifyPaymentSignature({ orderId, paymentId, signature });
    if (!valid) {
      payment.status = 'FAILED';
      payment.failure_reason = 'Razorpay signature verification failed';
      payment.updated_by = req.user.id;
      await payment.save({ transaction: t });
      if (payment.payment_type === 'PREMIUM_FEE') {
        payment.booking.premium_payment_status = 'FAILED';
        payment.booking.updated_by = req.user.id;
        await payment.booking.save({ transaction: t });
      }
      throw new AppError('Payment verification failed', 400);
    }

    payment.status = 'PAID';
    payment.razorpay_payment_id = paymentId;
    payment.razorpay_signature = signature;
    payment.paid_at = new Date();
    payment.updated_by = req.user.id;
    await payment.save({ transaction: t });

    if (payment.payment_type === 'PREMIUM_FEE') {
      payment.booking.premium_payment_status = 'PAID';
      payment.booking.updated_by = req.user.id;
      await payment.booking.save({ transaction: t });
      notifyPremiumBookingId = payment.booking_id;
    } else if (payment.payment_type === 'SALON_FEE') {
      notifySalonFee = { bookingId: payment.booking_id, amount: payment.amount };
    }

    await t.commit();
    committed = true;
    if (notifyPremiumBookingId) notifyPremiumPayment(notifyPremiumBookingId);
    if (notifySalonFee) notifyBookingPayment(notifySalonFee.bookingId, notifySalonFee.amount);

    const booking = await Booking.findByPk(payment.booking_id, {
      include: [
        { model: Salon, as: 'salon', attributes: ['id', 'salon_name', 'city'] },
        { model: Service, as: 'service', attributes: ['id', 'service_name', 'price', 'discount_price'] },
        paymentInclude(),
      ],
    });
    res.json({ data: shapePayment(payment), booking: shapeBookingWithPayments(booking) });
  } catch (err) {
    if (!committed) await t.rollback();
    next(err);
  }
};

exports.selectPayAtShop = async (req, res, next) => {
  const t = await sequelize.transaction();
  let committed = false;
  try {
    const { booking_id: bookingId } = req.body;
    if (!bookingId) throw new AppError('booking_id is required', 400);

    const { booking } = await loadCustomerBookingForPayment(req.user.id, bookingId, t);
    if (booking.booking_status !== 'ACCEPTED') {
      throw new AppError('Pay at shop is available only after salon accepts the booking', 400);
    }
    if (booking.booking_type === 'PREMIUM' && booking.premium_payment_status !== 'PAID') {
      throw new AppError('Pay the premium fee before selecting salon fee payment', 400);
    }

    const latest = await findLatestPayment(booking.id, 'SALON_FEE', t);
    if (latest?.status === 'PAID') throw new AppError('Salon fee is already paid', 409);
    if (latest?.status === 'PENDING' && latest.method === 'PAY_AT_SHOP') {
      await t.commit();
      committed = true;
      return res.json({ data: shapePayment(latest), booking: shapeBookingWithPayments(booking) });
    }

    const payment = await Payment.create({
      booking_id: booking.id,
      customer_id: booking.customer_id,
      salon_id: booking.salon_id,
      payment_type: 'SALON_FEE',
      amount: servicePayableAmount(booking.service),
      currency: 'INR',
      method: 'PAY_AT_SHOP',
      status: 'PENDING',
      created_by: req.user.id,
      updated_by: req.user.id,
    }, { transaction: t });

    await t.commit();
    committed = true;

    const fullBooking = await Booking.findByPk(booking.id, {
      include: [
        { model: Salon, as: 'salon', attributes: ['id', 'salon_name', 'city'] },
        { model: Service, as: 'service', attributes: ['id', 'service_name', 'price', 'discount_price'] },
        paymentInclude(),
      ],
    });
    res.json({ data: shapePayment(payment), booking: shapeBookingWithPayments(fullBooking) });
  } catch (err) {
    if (!committed) await t.rollback();
    next(err);
  }
};

exports.createReview = async (req, res, next) => {
  try {
    const customer = await Customer.findOne({ where: { user_id: req.user.id } });
    if (!customer) throw new AppError('Customer profile not found', 404);

    const { booking_id, rating, review } = req.body;
    if (!booking_id || rating === undefined || rating === null) {
      throw new AppError('booking_id and rating are required', 400);
    }

    const parsedRating = parseInt(rating, 10);
    if (!Number.isInteger(parsedRating) || parsedRating < 1 || parsedRating > 5) {
      throw new AppError('rating must be an integer between 1 and 5', 400);
    }

    const existingReview = await Review.findOne({ where: { booking_id } });
    if (existingReview) {
      throw new AppError('You have already reviewed this booking', 409);
    }

    const booking = await Booking.findOne({
      where: { id: booking_id, customer_id: customer.id },
      include: [{ model: Service, as: 'service' }],
    });
    if (!booking) throw new AppError('Booking not found', 404);

    if (!isBookingReviewable(booking, booking.service, null)) {
      throw new AppError('You can review this booking after your appointment slot ends', 400);
    }

    const row = await Review.create({
      customer_id: customer.id,
      salon_id: booking.salon_id,
      booking_id,
      rating: parsedRating,
      review,
      status: 'PUBLISHED',
      created_by: req.user.id,
      updated_by: req.user.id,
    });
    res.status(201).json({ data: row });
  } catch (err) {
    next(err);
  }
};

exports.getBanners = async (req, res, next) => {
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

exports.searchPlaces = async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 3) {
      return res.json({ data: [] });
    }

    const limit = Math.min(parseInt(req.query.limit, 10) || 5, 10);
    const data = await searchPlaces(q, { limit });
    res.json({ data });
  } catch (err) {
    next(err);
  }
};

exports.getServiceCategories = async (req, res, next) => {
  try {
    const rows = await ServiceCategory.findAll({
      where: { status: 'ACTIVE', is_active: true },
      order: [['sort_order', 'ASC'], ['name', 'ASC']],
    });
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
};

exports.validateCoupon = async (req, res, next) => {
  try {
    const { code } = req.body;
    const coupon = await Coupon.findOne({ where: { code: code?.toUpperCase(), status: 'ACTIVE' } });
    if (!coupon) throw new AppError('Invalid coupon', 404);
    const now = new Date();
    if (now < new Date(coupon.valid_from) || now > new Date(coupon.valid_to)) {
      throw new AppError('Coupon expired', 400);
    }
    res.json({ valid: true, coupon });
  } catch (err) {
    next(err);
  }
};

// Owner endpoints
exports.getOwnerSalons = async (req, res, next) => {
  try {
    const owner = await getSalonOwnerForUser(req.user.id);
    if (!owner) throw new AppError('Salon owner profile not found', 404);
    const salons = await Salon.findAll({ where: { owner_id: owner.id }, order: [['salon_name', 'ASC']] });
    res.json({ data: salons });
  } catch (err) {
    next(err);
  }
};

exports.getOwnerServices = async (req, res, next) => {
  try {
    await assertSalonOwnership(req.user.id, req.params.salonId);
    const services = await Service.findAll({
      where: { salon_id: req.params.salonId },
      include: [{ model: ServiceCategory, as: 'category', attributes: ['id', 'name'] }],
    });
    res.json({ data: services });
  } catch (err) {
    next(err);
  }
};

exports.createOwnerService = async (req, res, next) => {
  try {
    await assertSalonOwnership(req.user.id, req.params.salonId);
    const payload = buildOwnerServicePayload(req.body);
    const service = await Service.create({
      salon_id: req.params.salonId,
      ...payload,
      created_by: req.user.id,
      updated_by: req.user.id,
    });
    res.status(201).json({ data: service });
  } catch (err) {
    next(err);
  }
};

exports.updateOwnerService = async (req, res, next) => {
  try {
    await assertSalonOwnership(req.user.id, req.params.salonId);
    const service = await Service.findOne({ where: { id: req.params.serviceId, salon_id: req.params.salonId } });
    if (!service) throw new AppError('Service not found', 404);
    Object.assign(service, buildOwnerServicePayload(req.body, service));
    service.updated_by = req.user.id;
    await service.save();
    res.json({ data: service });
  } catch (err) {
    next(err);
  }
};

exports.getOwnerBookings = async (req, res, next) => {
  try {
    const owner = await getSalonOwnerForUser(req.user.id);
    if (!owner) throw new AppError('Salon owner profile not found', 404);
    const salons = await Salon.findAll({ where: { owner_id: owner.id }, attributes: ['id'] });
    const salonIds = salons.map((s) => s.id);

    const where = { salon_id: { [Op.in]: salonIds } };
    if (req.query.status) where.booking_status = req.query.status;

    const bookings = await Booking.findAll({
      where,
      include: [
        { model: Customer, as: 'customer', include: [{ model: User, as: 'user', attributes: ['name', 'phone', 'email'] }] },
        { model: Service, as: 'service', attributes: ['service_name', 'price', 'discount_price'] },
        { model: Salon, as: 'salon', attributes: ['salon_name'] },
        paymentInclude(),
      ],
      order: [['created_at', 'DESC']],
    });
    res.json({ data: bookings.map(shapeBookingWithPayments) });
  } catch (err) {
    next(err);
  }
};

exports.acceptBooking = async (req, res, next) => {
  const t = await sequelize.transaction();
  let committed = false;
  try {
    const booking = await Booking.findByPk(req.params.id, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!booking) throw new AppError('Booking not found', 404);
    await assertSalonOwnership(req.user.id, booking.salon_id);
    if (!canTransition(booking.booking_status, 'ACCEPTED')) {
      throw new AppError('Cannot accept this booking', 400);
    }

    // Accept every still-pending service in the same request.
    const group = await loadBookingGroupForUpdate(booking, t);
    for (const item of group) {
      if (!canTransition(item.booking_status, 'ACCEPTED')) continue;
      item.booking_status = 'ACCEPTED';
      item.responded_by = req.user.id;
      item.responded_at = new Date();
      item.updated_by = req.user.id;
      await item.save({ transaction: t });
      if (hasPremiumFee(item)) {
        await createPremiumPaymentWindow(item, req.user.id, t);
      }
    }
    await t.commit();
    committed = true;
    notifyBookingConfirmed(booking.id);

    const fullBooking = await Booking.findByPk(booking.id, {
      include: ownerBookingDetailInclude(),
    });
    res.json({ data: shapeBookingWithPayments(fullBooking) });
  } catch (err) {
    if (!committed) await t.rollback();
    next(err);
  }
};

exports.rejectBooking = async (req, res, next) => {
  const t = await sequelize.transaction();
  let committed = false;
  try {
    const booking = await Booking.findByPk(req.params.id, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!booking) throw new AppError('Booking not found', 404);
    await assertSalonOwnership(req.user.id, booking.salon_id);
    if (!canTransition(booking.booking_status, 'REJECTED')) {
      throw new AppError('Cannot reject this booking', 400);
    }

    // Reject every still-pending service in the same request so the slot is
    // fully freed (no orphaned siblings blocking a re-send).
    const rejectionReason = req.body.rejection_reason || null;
    const group = await loadBookingGroupForUpdate(booking, t);
    for (const item of group) {
      if (!canTransition(item.booking_status, 'REJECTED')) continue;
      item.booking_status = 'REJECTED';
      item.rejection_reason = rejectionReason;
      item.responded_by = req.user.id;
      item.responded_at = new Date();
      item.updated_by = req.user.id;
      await item.save({ transaction: t });
    }
    await t.commit();
    committed = true;
    notifyBookingRejected(booking.id);
    const fullBooking = await Booking.findByPk(booking.id, {
      include: ownerBookingDetailInclude(),
    });
    res.json({ data: shapeBookingWithPayments(fullBooking) });
  } catch (err) {
    if (!committed) await t.rollback();
    next(err);
  }
};

exports.getOwnerDashboard = async (req, res, next) => {
  try {
    const owner = await getSalonOwnerForUser(req.user.id);
    if (!owner) throw new AppError('Salon owner profile not found', 404);
    const salons = await Salon.findAll({ where: { owner_id: owner.id }, attributes: ['id'] });
    const salonIds = salons.map((s) => s.id);

    const [pending, accepted, completed, totalReviews] = await Promise.all([
      Booking.count({ where: { salon_id: { [Op.in]: salonIds }, booking_status: 'PENDING' } }),
      Booking.count({ where: { salon_id: { [Op.in]: salonIds }, booking_status: 'ACCEPTED' } }),
      Booking.count({ where: { salon_id: { [Op.in]: salonIds }, booking_status: 'COMPLETED' } }),
      Review.count({ where: { salon_id: { [Op.in]: salonIds } } }),
    ]);

    res.json({
      salonCount: salons.length,
      pendingBookings: pending,
      acceptedBookings: accepted,
      completedBookings: completed,
      totalReviews,
    });
  } catch (err) {
    next(err);
  }
};

exports.getOwnerReviews = async (req, res, next) => {
  try {
    const owner = await getSalonOwnerForUser(req.user.id);
    const salons = await Salon.findAll({ where: { owner_id: owner.id }, attributes: ['id'] });
    const reviews = await Review.findAll({
      where: { salon_id: { [Op.in]: salons.map((s) => s.id) } },
      include: [
        { model: Customer, as: 'customer', include: [{ model: User, as: 'user', attributes: ['name'] }] },
        { model: Salon, as: 'salon', attributes: ['salon_name'] },
      ],
      order: [['created_at', 'DESC']],
    });
    res.json({ data: reviews });
  } catch (err) {
    next(err);
  }
};

exports.completeBooking = async (req, res, next) => {
  const t = await sequelize.transaction();
  let committed = false;
  try {
    const booking = await Booking.findByPk(req.params.id, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!booking) throw new AppError('Booking not found', 404);
    await assertSalonOwnership(req.user.id, booking.salon_id);
    if (!canTransition(booking.booking_status, 'COMPLETED')) {
      throw new AppError('Cannot complete this booking', 400);
    }
    if (
      booking.booking_type === 'PREMIUM' &&
      hasPremiumFee(booking) &&
      booking.premium_payment_status !== 'PAID'
    ) {
      throw new AppError('Premium booking must be paid before completion', 400);
    }

    // Complete every accepted service in the same request. A still-unpaid
    // premium service is left as-is rather than failing the whole group.
    const group = await loadBookingGroupForUpdate(booking, t);
    for (const item of group) {
      if (!canTransition(item.booking_status, 'COMPLETED')) continue;
      if (
        item.booking_type === 'PREMIUM' &&
        hasPremiumFee(item) &&
        item.premium_payment_status !== 'PAID'
      ) {
        continue;
      }
      item.booking_status = 'COMPLETED';
      item.updated_by = req.user.id;
      await item.save({ transaction: t });
    }
    await t.commit();
    committed = true;
    notifyBookingCompleted(booking.id);
    const fullBooking = await Booking.findByPk(booking.id, {
      include: ownerBookingDetailInclude(),
    });
    res.json({ data: shapeBookingWithPayments(fullBooking) });
  } catch (err) {
    if (!committed) await t.rollback();
    next(err);
  }
};

exports.getOwnerSalonSlots = async (req, res, next) => {
  try {
    await assertSalonOwnership(req.user.id, req.params.salonId);
    const { date } = req.query;
    if (!date) throw new AppError('date query parameter is required (YYYY-MM-DD)', 400);
    const data = await getOwnerSlotsForSalon(req.params.salonId, date);
    res.json({ data });
  } catch (err) {
    next(err);
  }
};

exports.setOwnerSalonSlotBlock = async (req, res, next) => {
  try {
    await assertSalonOwnership(req.user.id, req.params.salonId);
    const { slot_date, slot_start, is_blocked, note } = req.body;
    const data = await setSlotBlocked(
      req.params.salonId,
      slot_date,
      slot_start,
      is_blocked,
      note,
      req.user.id
    );
    res.json({ data });
  } catch (err) {
    next(err);
  }
};

exports.uploadSalonImages = async (req, res, next) => {
  try {
    const owner = await getSalonOwnerForUser(req.user.id);
    if (!owner) throw new AppError('Register as salon owner first', 403);

    if (!req.files || req.files.length === 0) {
      throw new AppError('No images uploaded', 400);
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const path = require('path');
    const images = await Promise.all(
      req.files.map((file) => generateSalonImageVariants(
        path.join(file.destination, file.filename),
        baseUrl,
      )),
    );

    res.status(201).json({
      data: {
        urls: images.map((image) => image.medium),
        images,
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.uploadProfileImage = async (req, res, next) => {
  try {
    if (!req.file) {
      throw new AppError('No image uploaded', 400);
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const path = require('path');
    const url = await generateProfileImage(
      path.join(req.file.destination, req.file.filename),
      baseUrl,
    );

    res.status(201).json({ data: { url } });
  } catch (err) {
    next(err);
  }
};
