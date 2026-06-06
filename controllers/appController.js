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
  sequelize,
} = require('../models');
const AppError = require('../middlewares/AppError');
const { generateToken, loadUserWithRoles, shapeUserResponse, getRoleNames } = require('../utils/authHelpers');
const { getSalonOwnerForUser, assertSalonOwnership } = require('../utils/ownershipGuard');
const { generateBookingNumber, canTransition } = require('../services/bookingService');
const { logAudit } = require('../services/auditService');

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
        rejection_reason: application.rejection_reason,
        created_at: application.created_at,
      };
    }
  }
  return { salon_owner: owner, salon_application };
}

exports.register = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const { name, email, phone, password } = req.body;
    if (!name || !email || !password) throw new AppError('name, email, and password are required', 400);

    const existing = await User.findOne({ where: { email } });
    if (existing) throw new AppError('Email already registered', 409);

    const salt = await bcrypt.genSalt(10);
    const user = await User.create(
      {
        name,
        email,
        phone: phone || null,
        password: await bcrypt.hash(password, salt),
        status: 'ACTIVE',
      },
      { transaction: t }
    );

    await assignRole(user.id, 'CUSTOMER', null, t);
    await Customer.create({ user_id: user.id, status: 'ACTIVE' }, { transaction: t });

    await t.commit();

    const fullUser = await loadUserWithRoles(user.id);
    res.status(201).json({ token: generateToken(fullUser), user: shapeUserResponse(fullUser) });
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

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
    const { name, phone } = req.body;
    if (name) user.name = name;
    if (phone !== undefined) user.phone = phone;
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

    const application = await SalonApplication.create({
      owner_id: owner.id,
      ...req.body,
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

exports.browseSalons = async (req, res, next) => {
  try {
    const where = { status: 'ACTIVE', is_active: true };
    if (req.query.city) where.city = { [Op.iLike]: `%${req.query.city}%` };
    if (req.query.search) {
      where[Op.or] = [
        { salon_name: { [Op.iLike]: `%${req.query.search}%` } },
        { city: { [Op.iLike]: `%${req.query.search}%` } },
      ];
    }

    const salons = await Salon.findAll({
      where,
      order: [['salon_name', 'ASC']],
      limit: Math.min(parseInt(req.query.limit, 10) || 20, 50),
      offset: parseInt(req.query.offset, 10) || 0,
    });
    res.json({ data: salons });
  } catch (err) {
    next(err);
  }
};

exports.getSalon = async (req, res, next) => {
  try {
    const salon = await Salon.findOne({
      where: { id: req.params.id, status: 'ACTIVE' },
      include: [{
        model: Service,
        as: 'services',
        where: { status: 'ACTIVE' },
        required: false,
        include: [{ model: ServiceCategory, as: 'category', attributes: ['id', 'name'] }],
      }],
    });
    if (!salon) throw new AppError('Salon not found', 404);
    res.json({ data: salon });
  } catch (err) {
    next(err);
  }
};

exports.createBooking = async (req, res, next) => {
  try {
    const customer = await Customer.findOne({ where: { user_id: req.user.id } });
    if (!customer) throw new AppError('Customer profile not found', 404);

    const { salon_id, service_id, booking_date, booking_time, notes } = req.body;
    if (!salon_id || !service_id || !booking_date || !booking_time) {
      throw new AppError('salon_id, service_id, booking_date, booking_time are required', 400);
    }

    const service = await Service.findOne({ where: { id: service_id, salon_id, status: 'ACTIVE' } });
    if (!service) throw new AppError('Service not found', 404);

    const booking = await Booking.create({
      booking_number: await generateBookingNumber(),
      customer_id: customer.id,
      salon_id,
      service_id,
      booking_date,
      booking_time,
      notes,
      booking_status: 'PENDING',
      created_by: req.user.id,
      updated_by: req.user.id,
    });

    res.status(201).json({ data: booking });
  } catch (err) {
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
        { model: Service, as: 'service', attributes: ['id', 'service_name', 'price'] },
      ],
      order: [['booking_date', 'DESC'], ['booking_time', 'DESC']],
    });
    res.json({ data: bookings });
  } catch (err) {
    next(err);
  }
};

exports.cancelBooking = async (req, res, next) => {
  try {
    const customer = await Customer.findOne({ where: { user_id: req.user.id } });
    const booking = await Booking.findOne({ where: { id: req.params.id, customer_id: customer?.id } });
    if (!booking) throw new AppError('Booking not found', 404);
    if (!canTransition(booking.booking_status, 'CANCELLED')) {
      throw new AppError('Booking cannot be cancelled', 400);
    }
    booking.booking_status = 'CANCELLED';
    booking.updated_by = req.user.id;
    await booking.save();
    res.json({ data: booking });
  } catch (err) {
    next(err);
  }
};

exports.createReview = async (req, res, next) => {
  try {
    const customer = await Customer.findOne({ where: { user_id: req.user.id } });
    const { booking_id, rating, review } = req.body;
    if (!booking_id || !rating) throw new AppError('booking_id and rating are required', 400);

    const booking = await Booking.findOne({
      where: { id: booking_id, customer_id: customer.id, booking_status: 'COMPLETED' },
    });
    if (!booking) throw new AppError('Completed booking not found', 404);

    const row = await Review.create({
      customer_id: customer.id,
      salon_id: booking.salon_id,
      booking_id,
      rating,
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
    const service = await Service.create({
      salon_id: req.params.salonId,
      ...req.body,
      status: req.body.status || 'ACTIVE',
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
    Object.assign(service, req.body);
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
        { model: Service, as: 'service', attributes: ['service_name', 'price'] },
        { model: Salon, as: 'salon', attributes: ['salon_name'] },
      ],
      order: [['created_at', 'DESC']],
    });
    res.json({ data: bookings });
  } catch (err) {
    next(err);
  }
};

exports.acceptBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findByPk(req.params.id, { include: [{ model: Salon, as: 'salon' }] });
    if (!booking) throw new AppError('Booking not found', 404);
    await assertSalonOwnership(req.user.id, booking.salon_id);
    if (!canTransition(booking.booking_status, 'ACCEPTED')) {
      throw new AppError('Cannot accept this booking', 400);
    }
    booking.booking_status = 'ACCEPTED';
    booking.responded_by = req.user.id;
    booking.responded_at = new Date();
    booking.updated_by = req.user.id;
    await booking.save();
    res.json({ data: booking });
  } catch (err) {
    next(err);
  }
};

exports.rejectBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findByPk(req.params.id);
    if (!booking) throw new AppError('Booking not found', 404);
    await assertSalonOwnership(req.user.id, booking.salon_id);
    if (!canTransition(booking.booking_status, 'REJECTED')) {
      throw new AppError('Cannot reject this booking', 400);
    }
    booking.booking_status = 'REJECTED';
    booking.rejection_reason = req.body.rejection_reason || null;
    booking.responded_by = req.user.id;
    booking.responded_at = new Date();
    booking.updated_by = req.user.id;
    await booking.save();
    res.json({ data: booking });
  } catch (err) {
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
  try {
    const booking = await Booking.findByPk(req.params.id);
    if (!booking) throw new AppError('Booking not found', 404);
    await assertSalonOwnership(req.user.id, booking.salon_id);
    if (!canTransition(booking.booking_status, 'COMPLETED')) {
      throw new AppError('Cannot complete this booking', 400);
    }
    booking.booking_status = 'COMPLETED';
    booking.updated_by = req.user.id;
    await booking.save();
    res.json({ data: booking });
  } catch (err) {
    next(err);
  }
};
