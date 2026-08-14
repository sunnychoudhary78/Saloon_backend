const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Op, QueryTypes } = require('sequelize');
const {
  User,
  Role,
  UserRole,
  SalonOwner,
  SalonApplication,
  Salon,
  Service,
  SalonStaff,
  Customer,
  Booking,
  Review,
  Coupon,
  PromotionalBanner,
  Payment,
  PaymentLineItem,
  SalonPayoutAccount,
  SettlementLedger,
  PhoneOtpSession,
  sequelize,
} = require('../models');
const AppError = require('../middlewares/AppError');
const { generateToken, loadUserWithRoles, shapeUserResponse, getRoleNames, hasAnyRole } = require('../utils/authHelpers');
const { listFavoriteSalonIds, isSalonFavorited } = require('../services/favoriteService');
const {
  normalizePhone,
  isOtpExpired,
  MAX_VERIFY_ATTEMPTS,
} = require('../utils/otpHelpers');
const { requestOtpSms, OTP_PURPOSE } = require('../services/otpUsageService');
const { getSalonOwnerForUser, assertSalonOwnership } = require('../utils/ownershipGuard');
const { generateBookingNumber, canTransition } = require('../services/bookingService');
const {
  getSlotsForSalon,
  getOwnerSlotsForSalon,
  getTodayAvailabilitySummary,
  getBatchTodayAvailabilitySummaries,
  assertSlotBookable,
  assertCustomerServiceSlotFree,
  evaluateCustomerSlotRequest,
  findCustomerActiveSlotBookings,
  assertSlotGroupAcceptable,
  autoRejectCompetingPendingGroups,
  lockSlotForUpdate,
  setSlotBlocked,
  loadPremiumConfig,
  resolvePremiumConfigForSalon,
  normalizeSlotStart,
  formatDateOnly,
  CUSTOMER_DUPLICATE_SERVICE_MESSAGE,
  OWN_SLOT_BOOKED_MESSAGE,
  UPGRADE_AVAILABLE_MESSAGE,
  SLOT_CONFLICT_CODES,
} = require('../services/slotService');
const {
  notifyNewBooking,
  notifyBookingConfirmed,
  notifyBookingCancelledForOwner,
  notifyBookingRejected,
  notifyBookingCompleted,
  notifyPayAtShopSelected,
  notifyPremiumPaymentWindowExpired,
} = require('../services/bookingNotificationHelper');
const {
  applyPremiumPaymentDueAt,
  cancelExpiredPremiumGroup,
  isPremiumPaymentWindowExpired,
  premiumDueAtFromGroup,
} = require('../services/premiumPaymentExpiryService');
const { notifySalonApplicationSubmitted } = require('../services/salonApplicationNotificationHelper');
const { notifyNewReview } = require('../services/reviewNotificationHelper');
const {
  assertUniqueServiceIdentity,
  mapServiceIdentityConflict,
  resolveServiceFor,
} = require('../services/serviceIdentityService');
const { serviceNamesForSalonType } = require('../constants/salonServiceNames');
const {
  attachRatingSummary,
  getBatchSalonRatingSummaries,
  attachStaffRatingSummaries,
  attachAndSortStaffByRating,
  isBookingReviewable,
  shapeBookingReviewFlags,
  applyVisitReviewFlags,
  visitBookingIds,
  shapePublicReview,
  PUBLIC_REVIEW_WHERE,
} = require('../services/reviewService');
const {
  generateSalonImageVariants,
  generateProfileImage,
  generateStaffImage,
  shapeGalleryForDetail,
  shapeCoverForDetail,
} = require('../services/imageProcessingService');
const {
  getBatchDiscountFlags,
  getSalonIdsWithActiveServices,
  shapeBrowseSalonRows,
  discountedSalonExistsLiteral,
  minRatingSalonExistsLiteral,
  filterAndSortSalonsByAvailability,
} = require('../services/salonBrowseService');
const {
  parseUserCoordinates,
  distanceKmSqlLiteral,
  attachDistance,
  shapeSalonDistanceFields,
} = require('../services/locationService');
const { logAudit } = require('../services/auditService');
const { normalizeApplicationType, salonFieldsFromApplication } = require('../services/salonApplicationService');
const { ensureApplicationCoordinates } = require('../services/geocodingService');
const { searchPlaces, getPlaceDetails, reverseGeocodeCoordinates } = require('../services/geocodingService');
const {
  createOrReuseRazorpayOrder,
  deadlineFromNow,
  findLatestPayment,
  isExpired,
  markExpired,
  shapePayment,
  splitPayments,
} = require('../services/paymentService');
const {
  loadBookingGroupById,
  assertGroupAccepted,
  createCheckoutPayment,
  findActiveCheckout,
  resolveGroupId,
  resolvePremiumFeeForGroup,
  getCheckoutSummary,
} = require('../services/checkoutService');
const {
  dispatchPaymentNotifications,
  fulfillRazorpayPayment,
  fulfillCashPayment,
  recordExtraCashOnPaidPayment,
} = require('../services/paymentFulfillmentService');
const { encryptAccountNumber, maskAccountNumber } = require('../utils/payoutEncryption');
const { visitKeyFromRow } = require('../services/ownerDashboard/visitKey');

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
    include: [{ model: PaymentLineItem, as: 'line_items', required: false }],
  };
}

// Group checkout stores salon-fee payments on the primary booking_id only.
// Sibling rows in a multi-service visit have empty payments via booking_id
// include — merge visit-level payments so every row gets correct cash flags.
async function attachVisitPayments(bookings) {
  if (!bookings || bookings.length === 0) return [];

  const plains = bookings.map((booking) => (
    typeof booking.get === 'function' ? booking.get({ plain: true }) : { ...booking }
  ));
  const visitKeys = [...new Set(plains.map((row) => visitKeyFromRow(row)))];
  const bookingIds = plains.map((row) => row.id);

  const payments = await Payment.findAll({
    where: {
      status: { [Op.in]: ['PENDING', 'PAID'] },
      [Op.or]: [
        { booking_group_id: { [Op.in]: visitKeys } },
        { booking_id: { [Op.in]: bookingIds } },
      ],
    },
    include: [{ model: PaymentLineItem, as: 'line_items', required: false }],
  });

  const paymentsByVisit = new Map();
  for (const payment of payments) {
    const plain = typeof payment.get === 'function' ? payment.get({ plain: true }) : payment;
    const keys = new Set();
    if (plain.booking_group_id) keys.add(plain.booking_group_id);
    if (plain.booking_id) keys.add(plain.booking_id);
    for (const key of keys) {
      if (!paymentsByVisit.has(key)) paymentsByVisit.set(key, []);
      paymentsByVisit.get(key).push(plain);
    }
  }

  return plains.map((row) => {
    const visitId = visitKeyFromRow(row);
    const visitPayments = paymentsByVisit.get(visitId) || [];
    const byBookingId = paymentsByVisit.get(row.id) || [];
    const merged = new Map();
    for (const payment of [...(row.payments || []), ...visitPayments, ...byBookingId]) {
      if (payment?.id != null) merged.set(payment.id, payment);
    }
    return { ...row, payments: [...merged.values()] };
  });
}

function hasPremiumFee(booking) {
  const amount = Number(booking?.premium_amount);
  return Number.isFinite(amount) && amount > 0;
}

const CUSTOMER_SALON_ATTRS = ['id', 'salon_name', 'city', 'phone'];
const STAFF_BOOKING_ATTRS = ['id', 'name', 'profile_image'];
const CONFIRMED_BOOKING_STATUSES = new Set(['ACCEPTED', 'COMPLETED']);

function customerSalonInclude() {
  return { model: Salon, as: 'salon', attributes: CUSTOMER_SALON_ATTRS };
}

function staffBookingInclude() {
  return {
    model: SalonStaff,
    as: 'staff',
    attributes: STAFF_BOOKING_ATTRS,
    required: false,
  };
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
    staffBookingInclude(),
    paymentInclude(),
  ];
}

function resolveSalonFeePaymentState(salonFee) {
  if (!salonFee) return 'none';
  if (salonFee.status === 'PAID') return 'paid';
  if (salonFee.status === 'PENDING' && salonFee.method === 'PAY_AT_SHOP') {
    return 'pending_cash';
  }
  if (salonFee.status === 'PENDING' && salonFee.method === 'RAZORPAY') {
    return 'pending_online';
  }
  if (salonFee.status === 'PENDING') return 'pending_online';
  return 'none';
}

function shapeBookingWithPayments(booking) {
  const plain = typeof booking.get === 'function' ? booking.get({ plain: true }) : booking;
  const payments = (plain.payments || []).map((payment) => shapePayment(payment));
  const latest = splitPayments(payments);
  const salonFee = latest.salon_fee_payment;
  const salonFeePaymentState = resolveSalonFeePaymentState(salonFee);
  const requiresCashConfirmation = salonFeePaymentState === 'pending_cash';
  const canComplete = salonFeePaymentState === 'pending_cash'
    || salonFeePaymentState === 'paid';
  return {
    ...plain,
    payments,
    premium_payment: latest.premium_payment,
    salon_fee_payment: latest.salon_fee_payment,
    salon_fee_payment_state: salonFeePaymentState,
    requires_cash_confirmation: requiresCashConfirmation,
    can_complete: canComplete,
  };
}

function shapeCustomerBooking(booking) {
  const shaped = shapeBookingWithPayments(booking);
  if (shaped.salon && !CONFIRMED_BOOKING_STATUSES.has(shaped.booking_status)) {
    const salon = { ...shaped.salon };
    delete salon.phone;
    shaped.salon = salon;
  }
  return shaped;
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
      customerSalonInclude(),
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

  if (body.service_name !== undefined) {
    payload.service_name = String(body.service_name).trim();
    if (!payload.service_name) throw new AppError('service_name is required', 400);
  }
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
  if (body.service_for !== undefined) {
    payload.service_for = body.service_for;
  }

  if (!existing) {
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

function buildOwnerStaffPayload(body, existing = null) {
  const payload = {};

  if (body.name !== undefined) {
    const name = String(body.name || '').trim();
    if (!name) throw new AppError('name is required', 400);
    payload.name = name;
  }
  if (body.profile_image !== undefined) {
    payload.profile_image = body.profile_image
      ? String(body.profile_image).trim()
      : null;
  }
  if (body.status !== undefined) {
    if (!['ACTIVE', 'INACTIVE'].includes(body.status)) {
      throw new AppError('Invalid staff status', 400);
    }
    payload.status = body.status;
  }
  if (body.sort_order !== undefined) {
    const sortOrder = parseInt(body.sort_order, 10);
    if (!Number.isFinite(sortOrder) || sortOrder < 0) {
      throw new AppError('sort_order must be a non-negative integer', 400);
    }
    payload.sort_order = sortOrder;
  }

  if (!existing) {
    if (!payload.name) throw new AppError('name is required', 400);
    if (payload.status === undefined) payload.status = 'ACTIVE';
    if (payload.sort_order === undefined) payload.sort_order = 0;
  }

  return payload;
}

function snapshotSalonForApplication(salon, payload) {
  const gallery = Array.isArray(salon.gallery_images) ? salon.gallery_images : [];
  return {
    ...payload,
    salon_name: salon.salon_name,
    salon_type: salon.salon_type || 'UNISEX',
    address: salon.address,
    formatted_address: salon.formatted_address ?? null,
    locality: salon.locality ?? null,
    city: salon.city,
    state: salon.state,
    postal_code: salon.postal_code ?? null,
    latitude: salon.latitude,
    longitude: salon.longitude,
    cover_image: salon.cover_image ?? null,
    gallery_images: gallery,
    phone: salon.phone,
    opening_time: salon.opening_time,
    closing_time: salon.closing_time,
    premium_booking_fee: salon.premium_booking_fee ?? null,
    // Keep optional request reason when provided; otherwise retain salon description.
    description: payload.description || salon.description || null,
  };
}

function shapeSalonLocationFields(salon) {
  const address = salon.address || '';
  return {
    address,
    street: address,
    formatted_address: salon.formatted_address || null,
    locality: salon.locality || null,
    city: salon.city || null,
    state: salon.state || null,
    postal_code: salon.postal_code || null,
    latitude: salon.latitude != null ? Number(salon.latitude) : null,
    longitude: salon.longitude != null ? Number(salon.longitude) : null,
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
    const { name, email } = req.body;
    if (name) user.name = name;
    // Phone changes require OTP verification via /profile/phone/otp-*.
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
      if (gender !== undefined) {
        if (gender !== null && gender !== '' && gender !== 'male' && gender !== 'female') {
          throw new AppError('gender must be male or female', 400);
        }
        customer.gender = gender === '' ? null : gender;
      }
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

exports.requestPhoneChangeOtp = async (req, res, next) => {
  try {
    const phone = normalizePhone(req.body.phone);
    if (!phone) throw new AppError('Invalid phone number. Enter exactly 10 digits.', 400);

    const user = await User.findByPk(req.user.id);
    if (!user) throw new AppError('User not found', 404);

    if (user.phone && normalizePhone(user.phone) === phone) {
      throw new AppError('This is already your current phone number', 400);
    }

    const taken = await User.findOne({
      where: { phone, id: { [Op.ne]: user.id } },
    });
    if (taken) throw new AppError('This phone number is already registered', 409);

    await requestOtpSms({ phone, purpose: OTP_PURPOSE.PHONE_CHANGE });
    res.json({ message: 'OTP sent successfully' });
  } catch (err) {
    next(err);
  }
};

exports.verifyPhoneChangeOtp = async (req, res, next) => {
  try {
    const phone = normalizePhone(req.body.phone);
    const { otp } = req.body;
    if (!phone) throw new AppError('Invalid phone number', 400);

    const user = await User.findByPk(req.user.id);
    if (!user) throw new AppError('User not found', 404);

    if (user.phone && normalizePhone(user.phone) === phone) {
      throw new AppError('This is already your current phone number', 400);
    }

    const session = await PhoneOtpSession.findOne({ where: { phone } });
    if (!session) throw new AppError('OTP expired or not found. Please request a new OTP.', 400);

    if (session.attempt_count >= MAX_VERIFY_ATTEMPTS) {
      await PhoneOtpSession.destroy({ where: { phone } });
      throw new AppError('Too many failed attempts. Please request a new OTP.', 429);
    }

    if (isOtpExpired(session.otp_expires_at)) {
      await PhoneOtpSession.destroy({ where: { phone } });
      throw new AppError('OTP has expired. Please request a new OTP.', 400);
    }

    if (String(session.otp) !== String(otp)) {
      session.attempt_count += 1;
      await session.save();
      throw new AppError('Invalid OTP', 400);
    }

    const taken = await User.findOne({
      where: { phone, id: { [Op.ne]: user.id } },
    });
    if (taken) {
      await PhoneOtpSession.destroy({ where: { phone } });
      throw new AppError('This phone number is already registered', 409);
    }

    await PhoneOtpSession.destroy({ where: { phone } });

    user.phone = phone;
    user.updated_by = req.user.id;
    await user.save();

    const fullUser = await loadUserWithRoles(user.id);
    const customer = await Customer.findOne({ where: { user_id: user.id } });
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
    if (applicationType === 'UPDATE') {
      throw new AppError(
        'Salon profile edits no longer require approval. Update the salon directly instead.',
        400
      );
    }

    const salonId = req.body.salon_id || null;
    let payload = { ...req.body, application_type: applicationType };

    if (applicationType === 'DEACTIVATE' || applicationType === 'ACTIVATE') {
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
    notifySalonApplicationSubmitted(application.id);
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

async function favoriteIdSetForRequest(req, salonIds) {
  if (!hasAnyRole(req.user, ['CUSTOMER']) || !salonIds.length) return new Set();
  const ids = await listFavoriteSalonIds(req.user.id, salonIds);
  return new Set(ids);
}

exports.browseSalons = async (req, res, next) => {
  try {
    const where = { status: 'ACTIVE', is_active: true };
    const featuredOnly = isTruthy(req.query.featured);
    const discountedOnly = isTruthy(req.query.has_discount);
    const hasAvailableSlots = isTruthy(req.query.has_available_slots);
    const userCoords = parseUserCoordinates(req.query);
    const minRating = parseFloat(req.query.min_rating);
    const maxDistanceKm = parseFloat(req.query.max_distance_km);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
    const offset = parseInt(req.query.offset, 10) || 0;

    if (req.query.city) where.city = { [Op.iLike]: `%${req.query.city}%` };
    if (featuredOnly) where.is_featured = true;
    const audience = String(req.query.audience || '').trim().toLowerCase();
    if (audience === 'men') {
      where.salon_type = { [Op.in]: ['MEN', 'UNISEX'] };
    } else if (audience === 'women') {
      where.salon_type = { [Op.in]: ['WOMEN', 'UNISEX'] };
    }
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
      'salon_type',
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

    const browseAttributes = userCoords
      ? { include: [[distanceLiteral, 'distance_km']] }
      : baseAttributes;

    const findOptions = {
      where,
      distinct: true,
      subQuery: false,
      order,
      attributes: browseAttributes,
    };

    let salons;
    let count;

    if (hasAvailableSlots) {
      const allRows = await Salon.findAll(findOptions);
      const allPlain = allRows.map((salon) => salon.get({ plain: true }));
      const slotsMap = await getBatchTodayAvailabilitySummaries(allPlain);
      const filtered = filterAndSortSalonsByAvailability(allPlain, slotsMap, { userCoords });
      count = filtered.length;
      salons = filtered.slice(offset, offset + limit);

      const salonIds = salons.map((salon) => salon.id);
      const [ratingMap, discountMap, serviceSalonIds, favoriteIds] = await Promise.all([
        getBatchSalonRatingSummaries(salonIds),
        getBatchDiscountFlags(salonIds),
        getSalonIdsWithActiveServices(salonIds),
        favoriteIdSetForRequest(req, salonIds),
      ]);

      const data = shapeBrowseSalonRows(salons, {
        ratingMap,
        slotsMap,
        discountMap,
        serviceSalonIds,
        userCoords,
        favoriteIds,
      });

      return res.json({
        data,
        meta: {
          total: count,
          limit,
          offset,
          has_more: offset + data.length < count,
        },
      });
    }

    const pagedResult = await Salon.findAndCountAll({
      ...findOptions,
      limit,
      offset,
    });
    salons = pagedResult.rows;
    count = pagedResult.count;

    const salonIds = salons.map((salon) => salon.id);
    const salonPlain = salons.map((salon) => salon.get({ plain: true }));

    const [
      ratingMap,
      slotsMap,
      discountMap,
      serviceSalonIds,
      favoriteIds,
    ] = await Promise.all([
      getBatchSalonRatingSummaries(salonIds),
      getBatchTodayAvailabilitySummaries(salonPlain),
      getBatchDiscountFlags(salonIds),
      getSalonIdsWithActiveServices(salonIds),
      favoriteIdSetForRequest(req, salonIds),
    ]);

    const data = shapeBrowseSalonRows(salonPlain, {
      ratingMap,
      slotsMap,
      discountMap,
      serviceSalonIds,
      userCoords,
      favoriteIds,
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
      include: [
        {
          model: Service,
          as: 'services',
          where: { status: 'ACTIVE' },
          required: false,
        },
        {
          model: SalonStaff,
          as: 'staff',
          where: { status: 'ACTIVE', is_active: true },
          required: false,
          separate: true,
          order: [['sort_order', 'ASC'], ['name', 'ASC']],
        },
      ],
    });
    if (!salon) throw new AppError('Salon not found', 404);
    const userCoords = parseUserCoordinates(req.query);
    let data = await attachRatingSummary(salon.toJSON());
    data.staff = await attachAndSortStaffByRating(data.staff || []);
    data = userCoords
      ? attachDistance(data, userCoords.userLat, userCoords.userLng)
      : shapeSalonDistanceFields(data);
    data.cover_image = shapeCoverForDetail(data.cover_image, data.gallery_images);
    data.gallery_images = shapeGalleryForDetail(data.gallery_images);
    data = shapeDiscountSummary(data);
    data.street = data.address || '';
    data.is_favorite = hasAnyRole(req.user, ['CUSTOMER'])
      ? await isSalonFavorited(req.user.id, salon.id)
      : false;
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
      where: { salon_id: salon.id, ...PUBLIC_REVIEW_WHERE },
      include: [
        {
          model: Customer,
          as: 'customer',
          include: [{ model: User, as: 'user', attributes: ['name'] }],
        },
        {
          model: Booking,
          as: 'booking',
          attributes: ['id', 'staff_id'],
          include: [{ model: SalonStaff, as: 'staff', attributes: ['id', 'name'] }],
        },
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset,
      distinct: true,
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
      staff_id: staffIdBody,
      merge_into_group_id: mergeIntoGroupId,
    } = req.body;

    const serviceIds = Array.isArray(serviceIdsBody) && serviceIdsBody.length > 0
      ? [...new Set(serviceIdsBody)]
      : service_id
        ? [service_id]
        : [];

    if (!salon_id || serviceIds.length === 0 || !booking_date || !booking_time) {
      throw new AppError('salon_id, service_id or service_ids, booking_date, booking_time are required', 400);
    }

    const normalizedTime = normalizeSlotStart(booking_time);
    if (!normalizedTime) {
      throw new AppError('booking_time must be on a 30-minute slot (e.g. 10:00 or 10:30)', 400);
    }
    const dateStr = formatDateOnly(booking_date);
    await lockSlotForUpdate(salon_id, dateStr, normalizedTime, t);

    let preferredStaffId = null;
    if (staffIdBody) {
      const staff = await SalonStaff.findOne({
        where: {
          id: staffIdBody,
          salon_id,
          status: 'ACTIVE',
          is_active: true,
        },
        transaction: t,
      });
      if (!staff) throw new AppError('Preferred staff not found for this salon', 404);
      preferredStaffId = staff.id;
    }

    const createdBookings = [];
    let notifyBookingId = null;

    if (mergeIntoGroupId) {
      const groupRows = await Booking.findAll({
        where: {
          customer_id: customer.id,
          salon_id,
          [Op.or]: [
            { booking_group_id: mergeIntoGroupId },
            { id: mergeIntoGroupId },
          ],
        },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (groupRows.length === 0) throw new AppError('Booking not found', 404);
      if (groupRows.some((row) => row.booking_status !== 'PENDING')) {
        throw new AppError('This request can no longer be updated', 409, {
          code: SLOT_CONFLICT_CODES.OWN_SLOT_BOOKED,
        });
      }
      const primary = groupRows[0];
      if (
        formatDateOnly(primary.booking_date) !== dateStr
        || (normalizeSlotStart(primary.booking_time) || String(primary.booking_time).slice(0, 8)) !== normalizedTime
      ) {
        throw new AppError('That request is not for the selected slot', 400);
      }

      const resolvedGroupId = primary.booking_group_id || primary.id;
      for (const row of groupRows) {
        if (!row.booking_group_id) {
          row.booking_group_id = resolvedGroupId;
          row.updated_by = req.user.id;
          await row.save({ transaction: t });
        }
      }

      const existingServiceIds = new Set(groupRows.map((row) => String(row.service_id)));
      const toAdd = serviceIds.filter((id) => !existingServiceIds.has(String(id)));
      if (toAdd.length === 0) {
        throw new AppError(CUSTOMER_DUPLICATE_SERVICE_MESSAGE, 409, {
          code: SLOT_CONFLICT_CODES.DUPLICATE_SERVICE,
        });
      }

      const staffId = preferredStaffId || primary.staff_id;
      for (const currentServiceId of toAdd) {
        const service = await Service.findOne({
          where: { id: currentServiceId, salon_id, status: 'ACTIVE' },
          transaction: t,
        });
        if (!service) throw new AppError(`Service not found: ${currentServiceId}`, 404);

        await assertCustomerServiceSlotFree(
          salon_id,
          booking_date,
          normalizedTime,
          currentServiceId,
          customer.id,
          { transaction: t }
        );

        const booking = await Booking.create({
          booking_number: await generateBookingNumber(t),
          booking_group_id: resolvedGroupId,
          customer_id: customer.id,
          salon_id,
          service_id: currentServiceId,
          staff_id: staffId,
          booking_date,
          booking_time: normalizedTime,
          notes,
          booking_status: 'PENDING',
          booking_type: 'STANDARD',
          premium_amount: null,
          premium_payment_status: 'NONE',
          created_by: req.user.id,
          updated_by: req.user.id,
        }, { transaction: t });
        createdBookings.push(booking);
      }
    } else {
      const activeOwn = await findCustomerActiveSlotBookings(
        salon_id,
        booking_date,
        normalizedTime,
        customer.id,
        { transaction: t },
      );
      const decision = evaluateCustomerSlotRequest(activeOwn, serviceIds);

      if (decision.type === SLOT_CONFLICT_CODES.DUPLICATE_SERVICE) {
        throw new AppError(CUSTOMER_DUPLICATE_SERVICE_MESSAGE, 409, {
          code: SLOT_CONFLICT_CODES.DUPLICATE_SERVICE,
        });
      }
      if (decision.type === SLOT_CONFLICT_CODES.OWN_SLOT_BOOKED) {
        throw new AppError(OWN_SLOT_BOOKED_MESSAGE, 409, {
          code: SLOT_CONFLICT_CODES.OWN_SLOT_BOOKED,
        });
      }
      if (decision.type === SLOT_CONFLICT_CODES.UPGRADE_AVAILABLE) {
        const existingNames = (decision.existingRows || [])
          .map((row) => row.service?.service_name)
          .filter(Boolean);
        const newServices = await Service.findAll({
          where: { id: decision.newServiceIds, salon_id, status: 'ACTIVE' },
          attributes: ['id', 'service_name'],
          transaction: t,
        });
        if (newServices.length === 0) {
          throw new AppError(`Service not found: ${decision.newServiceIds[0]}`, 404);
        }
        throw new AppError(UPGRADE_AVAILABLE_MESSAGE, 409, {
          code: SLOT_CONFLICT_CODES.UPGRADE_AVAILABLE,
          group_id: decision.groupId,
          existing_service_names: existingNames,
          new_service_ids: newServices.map((s) => s.id),
          new_service_names: newServices.map((s) => s.service_name),
        });
      }

      const slotInfo = await assertSlotBookable(salon_id, booking_date, booking_time, {
        isPremium: Boolean(isPremium),
        transaction: t,
      });

      const isPremiumBooking = slotInfo.bookingType === 'PREMIUM';
      // All services requested together share one group id so the salon can
      // accept/reject/cancel them as a single logical booking.
      const bookingGroupId = crypto.randomUUID();

      for (let i = 0; i < serviceIds.length; i += 1) {
        const currentServiceId = serviceIds[i];

        const service = await Service.findOne({
          where: { id: currentServiceId, salon_id, status: 'ACTIVE' },
          transaction: t,
        });
        if (!service) throw new AppError(`Service not found: ${currentServiceId}`, 404);

        await assertCustomerServiceSlotFree(
          salon_id,
          booking_date,
          normalizedTime,
          currentServiceId,
          customer.id,
          { transaction: t }
        );

        const booking = await Booking.create({
          booking_number: await generateBookingNumber(t),
          booking_group_id: bookingGroupId,
          customer_id: customer.id,
          salon_id,
          service_id: currentServiceId,
          staff_id: preferredStaffId,
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
      notifyBookingId = createdBookings[0]?.id || null;
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
        customerSalonInclude(),
        { model: Service, as: 'service', attributes: ['id', 'service_name', 'price'] },
        staffBookingInclude(),
        paymentInclude(),
      ],
      order: [['created_at', 'ASC']],
    });

    res.status(201).json({
      data: fullBookings.length === 1
        ? shapeCustomerBooking(fullBookings[0])
        : fullBookings.map(shapeCustomerBooking),
    });

    if (notifyBookingId) {
      notifyNewBooking(notifyBookingId);
    }
  } catch (err) {
    await t.rollback();
    if (err.name === 'SequelizeUniqueConstraintError') {
      const constraint = String(err.parent?.constraint || err.index || '');
      if (constraint.includes('customer_service_slot')) {
        return next(new AppError(CUSTOMER_DUPLICATE_SERVICE_MESSAGE, 409, {
          code: SLOT_CONFLICT_CODES.DUPLICATE_SERVICE,
        }));
      }
      if (constraint.includes('accepted_premium_slot')) {
        return next(new AppError('Premium booking is already accepted for this slot', 409));
      }
      return next(new AppError('This slot is already booked', 409));
    }
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
        customerSalonInclude(),
        { model: Service, as: 'service', attributes: ['id', 'service_name', 'price', 'discount_price', 'duration_minutes'] },
        staffBookingInclude(),
        { model: Review, as: 'review', required: false },
        paymentInclude(),
      ],
      order: [['booking_date', 'DESC'], ['booking_time', 'DESC']],
    });

    const withVisitPayments = await attachVisitPayments(bookings);
    const data = applyVisitReviewFlags(withVisitPayments.map((booking) => {
      const plain = shapeCustomerBooking(booking);
      const flags = shapeBookingReviewFlags(booking, plain.service, plain.review);
      return { ...plain, ...flags };
    }));

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
    const {
      booking_group_id: bookingGroupIdBody,
      booking_id: bookingId,
      checkout_kind: checkoutKindBody,
      payment_type: paymentType,
    } = req.body;

    let checkoutKind = checkoutKindBody;
    if (!checkoutKind && paymentType === 'PREMIUM_FEE') checkoutKind = 'PREMIUM_ONLY';
    if (!checkoutKind && paymentType === 'SALON_FEE') checkoutKind = 'SALON_FEE';
    if (!checkoutKind) checkoutKind = 'SALON_FEE';
    if (!['PREMIUM_ONLY', 'SALON_FEE', 'COMBINED'].includes(checkoutKind)) {
      throw new AppError('Invalid checkout_kind', 400);
    }

    const customer = await Customer.findOne({ where: { user_id: req.user.id }, transaction: t });
    if (!customer) throw new AppError('Customer profile not found', 404);

    let groupId = bookingGroupIdBody;
    if (!groupId && bookingId) {
      const anchor = await Booking.findOne({
        where: { id: bookingId, customer_id: customer.id },
        transaction: t,
      });
      if (!anchor) throw new AppError('Booking not found', 404);
      groupId = resolveGroupId(anchor);
    }
    if (!groupId) throw new AppError('booking_group_id or booking_id is required', 400);

    const bookings = await loadBookingGroupById(groupId, customer.id, t);
    assertGroupAccepted(bookings);

    const isPremium = bookings.some((b) => b.booking_type === 'PREMIUM');
    const premiumPaid = !isPremium || bookings.some(
      (b) => b.booking_type === 'PREMIUM' && b.premium_payment_status === 'PAID',
    );
    const premiumBooking = bookings.find((b) => b.booking_type === 'PREMIUM');

    if (
      isPremium
      && !premiumPaid
      && isPremiumPaymentWindowExpired(premiumBooking)
    ) {
      const result = await cancelExpiredPremiumGroup(premiumBooking, {
        userId: req.user.id,
        transaction: t,
      });
      await t.commit();
      committed = true;
      if (result.cancelled) notifyPremiumPaymentWindowExpired(premiumBooking.id);
      throw new AppError('Payment window has expired', 400);
    }

    if (checkoutKind === 'PREMIUM_ONLY' || checkoutKind === 'COMBINED') {
      if (!isPremium) throw new AppError('This is not a premium booking', 400);
      if (premiumPaid) throw new AppError('Premium fee is already paid', 409);
    }
    if (checkoutKind === 'SALON_FEE' && isPremium && !premiumPaid) {
      throw new AppError('Pay the premium fee before salon fee payment', 400);
    }

    const premiumFee = await resolvePremiumFeeForGroup(bookings);
    const snapshotDueAt = premiumDueAtFromGroup(bookings);
    const expiresAt = (checkoutKind === 'PREMIUM_ONLY' || checkoutKind === 'COMBINED')
      ? (snapshotDueAt || deadlineFromNow((await loadPremiumConfig()).payment_window_minutes))
      : null;

    let payment = await findActiveCheckout(groupId, checkoutKind, t);
    if (payment?.status === 'PAID') {
      throw new AppError('This checkout is already paid', 409);
    }
    if (payment?.status === 'PENDING' && payment.method === 'PAY_AT_SHOP') {
      throw new AppError('Pay at shop is already selected for this visit', 409);
    }

    if (!payment || payment.status !== 'PENDING' || payment.method !== 'RAZORPAY') {
      payment = await createCheckoutPayment({
        bookings,
        checkoutKind,
        method: 'RAZORPAY',
        userId: req.user.id,
        premiumFeeAmount: premiumFee,
        expiresAt,
        transaction: t,
      });
    } else if (expiresAt) {
      payment.expires_at = expiresAt;
      payment.updated_by = req.user.id;
      await payment.save({ transaction: t });
    }

    await markExpired(payment, t);
    if (payment.status === 'EXPIRED') {
      if (checkoutKind === 'PREMIUM_ONLY' || checkoutKind === 'COMBINED') {
        const result = await cancelExpiredPremiumGroup(premiumBooking || bookings[0], {
          userId: req.user.id,
          transaction: t,
        });
        await t.commit();
        committed = true;
        if (result.cancelled) {
          notifyPremiumPaymentWindowExpired((premiumBooking || bookings[0]).id);
        }
      }
      throw new AppError('Payment window has expired', 400);
    }

    payment = await createOrReuseRazorpayOrder(payment, req.user.id, t);
    await t.commit();
    committed = true;

    const reloaded = await Payment.findByPk(payment.id, {
      include: [{ model: PaymentLineItem, as: 'line_items' }],
    });
    res.status(201).json({ data: shapePayment(reloaded, { includeRazorpayKey: true }) });
  } catch (err) {
    if (!committed) await t.rollback();
    next(err);
  }
};

exports.verifyRazorpayPayment = async (req, res, next) => {
  const t = await sequelize.transaction();
  let committed = false;
  try {
    const {
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature,
    } = req.body;

    const result = await fulfillRazorpayPayment({
      orderId,
      paymentId,
      signature,
      updatedByUserId: req.user.id,
      customerUserId: req.user.id,
      transaction: t,
      requireSignature: true,
      allowExpiredFulfillment: false,
    });

    if (!result.found) {
      throw new AppError('Payment order not found', 404);
    }

    await t.commit();
    committed = true;

    if (!result.alreadyPaid && result.notifications) {
      dispatchPaymentNotifications(result.notifications);
    }

    const booking = await Booking.findByPk(result.payment.booking_id, {
      include: [
        customerSalonInclude(),
        { model: Service, as: 'service', attributes: ['id', 'service_name', 'price', 'discount_price'] },
        paymentInclude(),
      ],
    });
    res.json({ data: shapePayment(result.payment), booking: shapeCustomerBooking(booking) });
  } catch (err) {
    if (!committed) await t.rollback();
    next(err);
  }
};

exports.selectPayAtShop = async (req, res, next) => {
  const t = await sequelize.transaction();
  let committed = false;
  try {
    const { booking_group_id: bookingGroupIdBody, booking_id: bookingId } = req.body;

    const customer = await Customer.findOne({ where: { user_id: req.user.id }, transaction: t });
    if (!customer) throw new AppError('Customer profile not found', 404);

    let groupId = bookingGroupIdBody;
    if (!groupId && bookingId) {
      const anchor = await Booking.findOne({
        where: { id: bookingId, customer_id: customer.id },
        transaction: t,
      });
      if (!anchor) throw new AppError('Booking not found', 404);
      groupId = resolveGroupId(anchor);
    }
    if (!groupId) throw new AppError('booking_group_id or booking_id is required', 400);

    const bookings = await loadBookingGroupById(groupId, customer.id, t);
    assertGroupAccepted(bookings);

    const isPremium = bookings.some((b) => b.booking_type === 'PREMIUM');
    const premiumPaid = !isPremium || bookings.some(
      (b) => b.booking_type === 'PREMIUM' && b.premium_payment_status === 'PAID',
    );
    if (isPremium && !premiumPaid) {
      throw new AppError('Pay the premium fee before selecting salon fee payment', 400);
    }

    let payment = await findActiveCheckout(groupId, 'SALON_FEE', t);
    if (payment?.status === 'PAID') throw new AppError('Salon fee is already paid', 409);
    if (payment?.status === 'PENDING' && payment.method === 'PAY_AT_SHOP') {
      await t.commit();
      committed = true;
      const primary = bookings[0];
      const fullBooking = await Booking.findByPk(primary.id, {
        include: [
          customerSalonInclude(),
          { model: Service, as: 'service', attributes: ['id', 'service_name', 'price', 'discount_price'] },
          paymentInclude(),
        ],
      });
      return res.json({
        data: shapePayment(payment),
        booking: shapeCustomerBooking(fullBooking),
      });
    }

    payment = await createCheckoutPayment({
      bookings,
      checkoutKind: 'SALON_FEE',
      method: 'PAY_AT_SHOP',
      userId: req.user.id,
      premiumFeeAmount: null,
      expiresAt: null,
      transaction: t,
    });

    await t.commit();
    committed = true;

    const primary = bookings[0];
    notifyPayAtShopSelected(primary.id, payment.amount);

    const fullBooking = await Booking.findByPk(primary.id, {
      include: [
        customerSalonInclude(),
        { model: Service, as: 'service', attributes: ['id', 'service_name', 'price', 'discount_price'] },
        paymentInclude(),
      ],
    });
    res.json({ data: shapePayment(payment), booking: shapeCustomerBooking(fullBooking) });
  } catch (err) {
    if (!committed) await t.rollback();
    next(err);
  }
};

exports.getCheckoutSummary = async (req, res, next) => {
  try {
    const customer = await Customer.findOne({ where: { user_id: req.user.id } });
    if (!customer) throw new AppError('Customer profile not found', 404);
    const data = await getCheckoutSummary(customer.id, req.params.groupId);
    res.json({ data });
  } catch (err) {
    next(err);
  }
};

exports.createReview = async (req, res, next) => {
  try {
    const customer = await Customer.findOne({ where: { user_id: req.user.id } });
    if (!customer) throw new AppError('Customer profile not found', 404);

    const { booking_id, rating, staff_rating: staffRatingBody, review } = req.body;

    const booking = await Booking.findOne({
      where: { id: booking_id, customer_id: customer.id },
      include: [{ model: Service, as: 'service' }],
    });
    if (!booking) throw new AppError('Booking not found', 404);

    const groupRows = booking.booking_group_id
      ? await Booking.findAll({
          where: { booking_group_id: booking.booking_group_id, customer_id: customer.id },
          attributes: ['id'],
        })
      : [booking];
    const visitIds = visitBookingIds(booking, groupRows);
    const existingReview = visitIds.length
      ? await Review.findOne({ where: { booking_id: { [Op.in]: visitIds } } })
      : null;
    if (existingReview) {
      throw new AppError('You have already reviewed this booking', 409);
    }

    if (!isBookingReviewable(booking, booking.service, null)) {
      throw new AppError('You can review this booking after your appointment slot ends', 400);
    }

    const hasStaff = Boolean(booking.staff_id);
    let staffRating = null;
    if (hasStaff) {
      if (staffRatingBody == null) {
        throw new AppError('staff_rating is required when the booking has assigned staff', 400);
      }
      staffRating = staffRatingBody;
    }

    const comment = typeof review === 'string' ? review.trim() : '';
    if ((rating <= 2 || (staffRating != null && staffRating <= 2)) && !comment) {
      throw new AppError('Please add a comment for low ratings', 400);
    }

    const row = await Review.create({
      customer_id: customer.id,
      salon_id: booking.salon_id,
      booking_id,
      rating,
      staff_rating: staffRating,
      review: comment || null,
      status: 'PUBLISHED',
      is_active: true,
      created_by: req.user.id,
      updated_by: req.user.id,
    });
    notifyNewReview(row.id);
    res.status(201).json({ data: row });
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      return next(new AppError('You have already reviewed this booking', 409));
    }
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

    const limit = Math.min(parseInt(req.query.limit, 10) || 8, 10);
    const lat = req.query.lat != null ? parseFloat(req.query.lat) : undefined;
    const lng = req.query.lng != null ? parseFloat(req.query.lng) : undefined;
    const radius = req.query.radius != null ? parseFloat(req.query.radius) : undefined;
    const sessiontoken = String(req.query.sessiontoken || '').trim() || undefined;

    const data = await searchPlaces(q, {
      limit,
      lat: Number.isFinite(lat) ? lat : undefined,
      lng: Number.isFinite(lng) ? lng : undefined,
      radius: Number.isFinite(radius) ? radius : undefined,
      sessiontoken,
    });
    res.json({ data });
  } catch (err) {
    next(err);
  }
};

exports.getPlaceDetails = async (req, res, next) => {
  try {
    const placeId = String(req.query.place_id || '').trim();
    if (!placeId) throw new AppError('place_id is required', 400);

    const sessiontoken = String(req.query.sessiontoken || '').trim() || undefined;
    const data = await getPlaceDetails(placeId, { sessiontoken });
    if (!data) throw new AppError('Place not found', 404);

    res.json({ data });
  } catch (err) {
    next(err);
  }
};


exports.reverseGeocodePlace = async (req, res, next) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new AppError('lat and lng are required', 400);
    }

    const data = await reverseGeocodeCoordinates(lat, lng);
    if (!data) throw new AppError('Could not resolve address for coordinates', 404);

    res.json({ data });
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
    res.json({
      data: salons.map((salon) => {
        const json = salon.toJSON();
        json.street = json.address || '';
        return json;
      }),
    });
  } catch (err) {
    next(err);
  }
};

exports.getServiceNames = async (req, res, next) => {
  try {
    const salonType = String(req.query.salon_type || 'UNISEX').toUpperCase();
    if (!['MEN', 'WOMEN', 'UNISEX'].includes(salonType)) {
      throw new AppError('salon_type must be MEN, WOMEN, or UNISEX', 400);
    }
    res.json({ data: serviceNamesForSalonType(salonType) });
  } catch (err) {
    next(err);
  }
};

exports.getOwnerServices = async (req, res, next) => {
  try {
    await assertSalonOwnership(req.user.id, req.params.salonId);
    const services = await Service.findAll({
      where: { salon_id: req.params.salonId },
    });
    res.json({ data: services });
  } catch (err) {
    next(err);
  }
};

exports.createOwnerService = async (req, res, next) => {
  try {
    const { salon } = await assertSalonOwnership(req.user.id, req.params.salonId);
    const payload = buildOwnerServicePayload(req.body);
    payload.service_for = resolveServiceFor({
      salonType: salon.salon_type,
      requested: req.body.service_for,
      isCreate: true,
    });
    await assertUniqueServiceIdentity({
      salonId: req.params.salonId,
      serviceName: payload.service_name,
      serviceFor: payload.service_for,
    });
    const service = await Service.create({
      salon_id: req.params.salonId,
      ...payload,
      created_by: req.user.id,
      updated_by: req.user.id,
    });
    res.status(201).json({ data: service });
  } catch (err) {
    next(mapServiceIdentityConflict(err));
  }
};

exports.updateOwnerService = async (req, res, next) => {
  try {
    const { salon } = await assertSalonOwnership(req.user.id, req.params.salonId);
    const service = await Service.findOne({ where: { id: req.params.serviceId, salon_id: req.params.salonId } });
    if (!service) throw new AppError('Service not found', 404);
    Object.assign(service, buildOwnerServicePayload(req.body, service));
    service.service_for = resolveServiceFor({
      salonType: salon.salon_type,
      requested: req.body.service_for,
      existing: service,
      isCreate: false,
    });
    await assertUniqueServiceIdentity({
      salonId: req.params.salonId,
      serviceName: service.service_name,
      serviceFor: service.service_for,
      excludeId: service.id,
    });
    service.updated_by = req.user.id;
    await service.save();
    res.json({ data: service });
  } catch (err) {
    next(mapServiceIdentityConflict(err));
  }
};

exports.getOwnerStaff = async (req, res, next) => {
  try {
    await assertSalonOwnership(req.user.id, req.params.salonId);
    const staff = await SalonStaff.findAll({
      where: { salon_id: req.params.salonId },
      order: [['sort_order', 'ASC'], ['name', 'ASC']],
    });
    const shaped = await attachAndSortStaffByRating(staff.map((row) => row.toJSON()));
    res.json({ data: shaped });
  } catch (err) {
    next(err);
  }
};

exports.createOwnerStaff = async (req, res, next) => {
  try {
    await assertSalonOwnership(req.user.id, req.params.salonId);
    const payload = buildOwnerStaffPayload(req.body);
    const staff = await SalonStaff.create({
      salon_id: req.params.salonId,
      ...payload,
      created_by: req.user.id,
      updated_by: req.user.id,
    });
    const shaped = (await attachStaffRatingSummaries([staff.toJSON()]))[0];
    res.status(201).json({ data: shaped });
  } catch (err) {
    next(err);
  }
};

exports.updateOwnerStaff = async (req, res, next) => {
  try {
    await assertSalonOwnership(req.user.id, req.params.salonId);
    const staff = await SalonStaff.findOne({
      where: { id: req.params.staffId, salon_id: req.params.salonId },
    });
    if (!staff) throw new AppError('Staff not found', 404);
    Object.assign(staff, buildOwnerStaffPayload(req.body, staff));
    staff.updated_by = req.user.id;
    await staff.save();
    const shaped = (await attachStaffRatingSummaries([staff.toJSON()]))[0];
    res.json({ data: shaped });
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
        staffBookingInclude(),
        paymentInclude(),
      ],
      order: [['created_at', 'DESC']],
    });
    const withVisitPayments = await attachVisitPayments(bookings);
    res.json({ data: withVisitPayments.map(shapeBookingWithPayments) });
  } catch (err) {
    next(err);
  }
};

exports.acceptBooking = async (req, res, next) => {
  const t = await sequelize.transaction();
  let committed = false;
  try {
    const bookingPreview = await Booking.findByPk(req.params.id, { transaction: t });
    if (!bookingPreview) throw new AppError('Booking not found', 404);

    await lockSlotForUpdate(
      bookingPreview.salon_id,
      formatDateOnly(bookingPreview.booking_date),
      normalizeSlotStart(bookingPreview.booking_time) || bookingPreview.booking_time,
      t,
    );

    const booking = await Booking.findByPk(req.params.id, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!booking) throw new AppError('Booking not found', 404);
    await assertSalonOwnership(req.user.id, booking.salon_id);

    if (booking.booking_status === 'ACCEPTED') {
      await t.commit();
      committed = true;
      const fullBooking = await Booking.findByPk(booking.id, {
        include: ownerBookingDetailInclude(),
      });
      return res.json({ data: shapeBookingWithPayments(fullBooking) });
    }

    if (!canTransition(booking.booking_status, 'ACCEPTED')) {
      throw new AppError('Cannot accept this booking', 400);
    }

    // Accept every still-pending service in the same request.
    const group = await loadBookingGroupForUpdate(booking, t);
    await assertSlotGroupAcceptable(group, { transaction: t });
    const hasPremium = group.some((item) => item.booking_type === 'PREMIUM');
    const dueAt = hasPremium
      ? deadlineFromNow((await loadPremiumConfig()).payment_window_minutes)
      : null;
    if (dueAt) applyPremiumPaymentDueAt(group, dueAt);
    for (const item of group) {
      if (!canTransition(item.booking_status, 'ACCEPTED')) continue;
      item.booking_status = 'ACCEPTED';
      item.responded_by = req.user.id;
      item.responded_at = new Date();
      item.updated_by = req.user.id;
      await item.save({ transaction: t });
    }

    const rejectedIds = await autoRejectCompetingPendingGroups({
      salonId: booking.salon_id,
      bookingDate: booking.booking_date,
      bookingTime: booking.booking_time,
      currentGroup: group,
      userId: req.user.id,
      transaction: t,
    });

    await t.commit();
    committed = true;
    notifyBookingConfirmed(booking.id);
    for (const rejectedId of rejectedIds) {
      notifyBookingRejected(rejectedId);
    }

    const fullBooking = await Booking.findByPk(booking.id, {
      include: ownerBookingDetailInclude(),
    });
    res.json({ data: shapeBookingWithPayments(fullBooking) });
  } catch (err) {
    if (!committed) await t.rollback();
    if (err.name === 'SequelizeUniqueConstraintError') {
      const constraint = String(err.parent?.constraint || err.index || '');
      if (constraint.includes('accepted_premium_slot')) {
        return next(new AppError('Premium booking is already accepted for this slot', 409));
      }
      return next(new AppError('This slot is already booked', 409));
    }
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

    if (booking.booking_status === 'REJECTED') {
      await t.commit();
      committed = true;
      const fullBooking = await Booking.findByPk(booking.id, {
        include: ownerBookingDetailInclude(),
      });
      return res.json({ data: shapeBookingWithPayments(fullBooking) });
    }

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
      Review.count({ where: { salon_id: { [Op.in]: salonIds }, ...PUBLIC_REVIEW_WHERE } }),
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
    const includeHidden = String(req.query.include_hidden || '').toLowerCase() === 'true'
      || req.query.include_hidden === '1'
      || req.query.include_hidden === true;

    const where = { salon_id: { [Op.in]: salons.map((s) => s.id) } };
    if (!includeHidden) {
      Object.assign(where, PUBLIC_REVIEW_WHERE);
    }

    const reviews = await Review.findAll({
      where,
      include: [
        { model: Customer, as: 'customer', include: [{ model: User, as: 'user', attributes: ['name'] }] },
        { model: Salon, as: 'salon', attributes: ['salon_name'] },
        {
          model: Booking,
          as: 'booking',
          attributes: ['id', 'staff_id'],
          include: [{ model: SalonStaff, as: 'staff', attributes: ['id', 'name'] }],
        },
      ],
      order: [['created_at', 'DESC']],
    });
    res.json({
      data: reviews.map((row) => {
        const plain = row.get({ plain: true });
        return {
          ...plain,
          customer_name: plain.customer?.user?.name || null,
          staff_name: plain.booking?.staff?.name || null,
        };
      }),
    });
  } catch (err) {
    next(err);
  }
};

exports.completeBooking = async (req, res, next) => {
  const t = await sequelize.transaction();
  let committed = false;
  let cashNotifications = null;
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

    const groupId = booking.booking_group_id || booking.id;
    // Lock Payment only — include + FOR UPDATE fails on PG outer joins.
    const salonFeePayment = await Payment.findOne({
      where: {
        booking_group_id: groupId,
        checkout_kind: { [Op.in]: ['SALON_FEE', 'COMBINED'] },
        status: { [Op.in]: ['PENDING', 'PAID'] },
      },
      transaction: t,
      lock: t.LOCK.UPDATE,
      order: [['created_at', 'DESC']],
    });
    const feeState = resolveSalonFeePaymentState(
      salonFeePayment ? shapePayment(salonFeePayment) : null,
    );
    if (feeState !== 'pending_cash' && feeState !== 'paid') {
      throw new AppError(
        feeState === 'pending_online'
          ? 'Online payment must be completed before finishing this booking'
          : 'Customer payment is required before completing this booking',
        400,
      );
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

    // Completing a pay-at-salon visit implies cash was received.
    if (
      salonFeePayment
      && salonFeePayment.method === 'PAY_AT_SHOP'
      && salonFeePayment.status === 'PENDING'
    ) {
      const cashResult = await fulfillCashPayment(
        salonFeePayment.id,
        req.user.id,
        {
          extraAmount: req.body?.extra_amount,
          confirmedAmount: req.body?.confirmed_amount,
        },
        t,
      );
      if (!cashResult.alreadyPaid) {
        cashNotifications = cashResult.notifications;
      }
    } else if (salonFeePayment && salonFeePayment.status === 'PAID') {
      const extraResult = await recordExtraCashOnPaidPayment(
        salonFeePayment,
        req.user.id,
        {
          extraAmount: req.body?.extra_amount,
          confirmedAmount: req.body?.confirmed_amount,
        },
        t,
      );
      if (extraResult.notifications) {
        cashNotifications = extraResult.notifications;
      }
    }

    await t.commit();
    committed = true;
    notifyBookingCompleted(booking.id);
    if (cashNotifications) {
      dispatchPaymentNotifications(cashNotifications);
    }
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

exports.updateOwnerSalonPremiumBooking = async (req, res, next) => {
  try {
    const { salon } = await assertSalonOwnership(req.user.id, req.params.salonId);
    const { premium_booking_fee: premiumBookingFee } = req.body;

    salon.premium_booking_fee = premiumBookingFee;
    salon.updated_by = req.user.id;
    await salon.save();

    const premiumConfig = await resolvePremiumConfigForSalon(salon);
    res.json({
      data: {
        premium_booking_fee: salon.premium_booking_fee,
        premium_config: premiumConfig,
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.updateOwnerSalon = async (req, res, next) => {
  try {
    const { salon } = await assertSalonOwnership(req.user.id, req.params.salonId);
    const salonCoords = await ensureApplicationCoordinates(req.body);
    if (!salonCoords) {
      throw new AppError(
        'Salon location is required — set coordinates or use a valid address',
        400
      );
    }

    await salon.update({
      ...salonFieldsFromApplication(req.body, salonCoords, salon),
      updated_by: req.user.id,
    });

    await logAudit({
      userId: req.user.id,
      action: 'salon.update',
      entityType: 'Salon',
      entityId: salon.id,
      req,
    });

    res.json({ data: salon });
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

    const path = require('path');
    const url = await generateProfileImage(
      path.join(req.file.destination, req.file.filename),
    );

    res.status(201).json({ data: { url } });
  } catch (err) {
    next(err);
  }
};

exports.uploadStaffImage = async (req, res, next) => {
  try {
    if (!req.file) {
      throw new AppError('No image uploaded', 400);
    }

    const path = require('path');
    const url = await generateStaffImage(
      path.join(req.file.destination, req.file.filename),
    );

    res.status(201).json({ data: { url } });
  } catch (err) {
    next(err);
  }
};

exports.confirmBookingGroupCash = async (req, res, next) => {
  const t = await sequelize.transaction();
  let committed = false;
  try {
    const groupId = req.params.groupId;
    const owner = await getSalonOwnerForUser(req.user.id);
    if (!owner) throw new AppError('Salon owner profile not found', 404);

    const bookings = await Booking.findAll({
      where: { booking_group_id: groupId },
      transaction: t,
    });
    const groupBookings = bookings.length > 0
      ? bookings
      : await Booking.findAll({ where: { id: groupId }, transaction: t });
    if (groupBookings.length === 0) throw new AppError('Booking group not found', 404);

    await assertSalonOwnership(req.user.id, groupBookings[0].salon_id);

    // Lock Payment only — include + FOR UPDATE fails on PG outer joins.
    // fulfillCashPayment reloads payment with line_items safely.
    const payment = await Payment.findOne({
      where: {
        booking_group_id: groupId,
        checkout_kind: 'SALON_FEE',
        method: 'PAY_AT_SHOP',
        status: 'PENDING',
      },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!payment) throw new AppError('No pending pay-at-shop checkout for this visit', 404);

    const result = await fulfillCashPayment(
      payment.id,
      req.user.id,
      {
        extraAmount: req.body?.extra_amount,
        confirmedAmount: req.body?.confirmed_amount,
      },
      t,
    );

    await t.commit();
    committed = true;

    if (!result.alreadyPaid && result.notifications) {
      dispatchPaymentNotifications(result.notifications);
    }

    res.json({ data: shapePayment(result.payment) });
  } catch (err) {
    if (!committed) await t.rollback();
    next(err);
  }
};

exports.getOwnerEarningsSummary = async (req, res, next) => {
  try {
    const owner = await getSalonOwnerForUser(req.user.id);
    if (!owner) throw new AppError('Salon owner profile not found', 404);

    const salons = await Salon.findAll({ where: { owner_id: owner.id }, attributes: ['id'] });
    const salonIds = salons.map((s) => s.id);
    if (salonIds.length === 0) {
      return res.json({
        data: {
          pending: 0,
          in_batch: 0,
          pending_total: 0,
          settled_total: 0,
          collected_at_salon: 0,
          platform_fee_owed: 0,
        },
      });
    }

    const schema = process.env.DB_SCHEMA || 'salon_booking_schema';
    const [row] = await sequelize.query(
      `
      SELECT
        COALESCE(SUM(sl.amount) FILTER (
          WHERE sl.status = 'PENDING'
            AND sl.entry_type IN ('SERVICE_SALON_NET', 'PREMIUM_SALON')
        ), 0) AS pending,
        COALESCE(SUM(sl.amount) FILTER (
          WHERE sl.status = 'IN_BATCH'
            AND sl.entry_type IN ('SERVICE_SALON_NET', 'PREMIUM_SALON')
        ), 0) AS in_batch,
        COALESCE(SUM(sl.amount) FILTER (
          WHERE sl.status = 'SETTLED'
            AND sl.entry_type IN ('SERVICE_SALON_NET', 'PREMIUM_SALON')
        ), 0) AS settled,
        COALESCE(SUM(sl.amount) FILTER (
          WHERE sl.status = 'COLLECTED'
            AND sl.entry_type IN ('SERVICE_SALON_NET', 'PREMIUM_SALON', 'ADJUSTMENT')
        ), 0) AS collected_at_salon,
        COALESCE(SUM(sl.amount) FILTER (
          WHERE sl.status = 'PENDING'
            AND sl.entry_type IN ('SERVICE_COMMISSION', 'PREMIUM_PLATFORM')
            AND p.method = 'PAY_AT_SHOP'
        ), 0) AS platform_fee_owed
      FROM "${schema}"."settlement_ledger" sl
      LEFT JOIN "${schema}"."payments" p ON p.id = sl.payment_id
      WHERE sl.salon_id IN (:salonIds)
      `,
      {
        replacements: { salonIds },
        type: QueryTypes.SELECT,
      },
    );

    const pendingNum = Number(row?.pending) || 0;
    const inBatchNum = Number(row?.in_batch) || 0;
    const platformFeeOwed = Number(row?.platform_fee_owed) || 0;
    const grossPending = pendingNum + inBatchNum;
    res.json({
      data: {
        pending: pendingNum,
        in_batch: inBatchNum,
        pending_total: Math.max(0, grossPending - platformFeeOwed),
        settled_total: Number(row?.settled) || 0,
        collected_at_salon: Number(row?.collected_at_salon) || 0,
        platform_fee_owed: platformFeeOwed,
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.getOwnerEarningsTransactions = async (req, res, next) => {
  try {
    const owner = await getSalonOwnerForUser(req.user.id);
    if (!owner) throw new AppError('Salon owner profile not found', 404);

    const salons = await Salon.findAll({ where: { owner_id: owner.id }, attributes: ['id'] });
    const salonIds = salons.map((s) => s.id);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 20, 1);
    const offset = (page - 1) * limit;

    const { Op } = require('sequelize');
    const { count, rows } = await SettlementLedger.findAndCountAll({
      where: {
        salon_id: { [Op.in]: salonIds },
        entry_type: { [Op.in]: ['SERVICE_SALON_NET', 'PREMIUM_SALON', 'ADJUSTMENT'] },
      },
      order: [['created_at', 'DESC']],
      limit,
      offset,
    });

    res.json({
      data: rows.map((r) => r.get({ plain: true })),
      meta: { total: count, page, limit, totalPages: Math.ceil(count / limit) },
    });
  } catch (err) {
    next(err);
  }
};

exports.getOwnerPayoutAccount = async (req, res, next) => {
  try {
    const owner = await getSalonOwnerForUser(req.user.id);
    if (!owner) throw new AppError('Salon owner profile not found', 404);

    const account = await SalonPayoutAccount.findOne({
      where: { salon_owner_id: owner.id, is_primary: true, is_active: true },
    });
    if (!account) return res.json({ data: null });

    const plain = account.get({ plain: true });
    res.json({
      data: {
        ...plain,
        account_number_masked: maskAccountNumber(
          require('../utils/payoutEncryption').decryptAccountNumber(plain.account_number_encrypted),
        ),
        account_number_encrypted: undefined,
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.upsertOwnerPayoutAccount = async (req, res, next) => {
  try {
    const owner = await getSalonOwnerForUser(req.user.id);
    if (!owner) throw new AppError('Salon owner profile not found', 404);

    const {
      account_holder_name: accountHolderName,
      account_number: accountNumber,
      ifsc_code: ifscCode,
      upi_id: upiId,
      salon_id: salonId,
    } = req.body;

    if (!accountHolderName || !accountNumber || !ifscCode) {
      throw new AppError('account_holder_name, account_number, and ifsc_code are required', 400);
    }

    let account = await SalonPayoutAccount.findOne({
      where: { salon_owner_id: owner.id, is_primary: true },
    });

    const payload = {
      salon_owner_id: owner.id,
      salon_id: salonId || null,
      account_holder_name: accountHolderName,
      account_number_encrypted: encryptAccountNumber(accountNumber),
      ifsc_code: ifscCode.toUpperCase(),
      upi_id: upiId || null,
      is_primary: true,
      verification_status: 'PENDING',
      updated_by: req.user.id,
    };

    if (account) {
      Object.assign(account, payload);
      await account.save();
    } else {
      account = await SalonPayoutAccount.create({
        ...payload,
        created_by: req.user.id,
      });
    }

    res.json({
      data: {
        id: account.id,
        account_holder_name: account.account_holder_name,
        ifsc_code: account.ifsc_code,
        upi_id: account.upi_id,
        verification_status: account.verification_status,
        account_number_masked: maskAccountNumber(accountNumber),
      },
    });
  } catch (err) {
    next(err);
  }
};
