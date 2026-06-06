const {
  Salon,
  SalonApplication,
  Customer,
  Booking,
  Review,
  SalonOwner,
  User,
  Role,
  UserRole,
  sequelize,
} = require('../models');
const { Op, fn, col, literal } = require('sequelize');

exports.getSalonOverview = async (req, res, next) => {
  try {
    const [
      totalSalons,
      pendingApplications,
      approvedSalons,
      totalCustomers,
      totalBookings,
      pendingBookings,
      completedBookings,
    ] = await Promise.all([
      Salon.count({ where: { status: 'ACTIVE' } }),
      SalonApplication.count({ where: { application_status: 'PENDING_APPROVAL' } }),
      Salon.count({ where: { status: 'ACTIVE' } }),
      Customer.count({ where: { status: 'ACTIVE' } }),
      Booking.count(),
      Booking.count({ where: { booking_status: 'PENDING' } }),
      Booking.count({ where: { booking_status: 'COMPLETED' } }),
    ]);

    res.json({
      totalSalons,
      pendingApplications,
      approvedSalons,
      totalCustomers,
      totalBookings,
      pendingBookings,
      completedBookings,
    });
  } catch (err) {
    next(err);
  }
};

exports.getCharts = async (req, res, next) => {
  try {
    const months = 6;
    const salonGrowth = await sequelize.query(
      `SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month, COUNT(*)::int AS count
       FROM ${process.env.DB_SCHEMA || 'salon_booking_schema'}.salons
       WHERE created_at >= NOW() - INTERVAL '${months} months'
       GROUP BY 1 ORDER BY 1`,
      { type: sequelize.QueryTypes.SELECT }
    );

    const customerGrowth = await sequelize.query(
      `SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month, COUNT(*)::int AS count
       FROM ${process.env.DB_SCHEMA || 'salon_booking_schema'}.customers
       WHERE created_at >= NOW() - INTERVAL '${months} months'
       GROUP BY 1 ORDER BY 1`,
      { type: sequelize.QueryTypes.SELECT }
    );

    const bookingTrends = await sequelize.query(
      `SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month, COUNT(*)::int AS count
       FROM ${process.env.DB_SCHEMA || 'salon_booking_schema'}.bookings
       WHERE created_at >= NOW() - INTERVAL '${months} months'
       GROUP BY 1 ORDER BY 1`,
      { type: sequelize.QueryTypes.SELECT }
    );

    res.json({ salonGrowth, customerGrowth, bookingTrends });
  } catch (err) {
    next(err);
  }
};

exports.getRecentActivity = async (req, res, next) => {
  try {
    const [newApplications, newBookings, newReviews] = await Promise.all([
      SalonApplication.findAll({
        where: { application_status: 'PENDING_APPROVAL' },
        order: [['created_at', 'DESC']],
        limit: 5,
        include: [{ model: SalonOwner, as: 'owner', include: [{ model: User, as: 'user', attributes: ['name'] }] }],
      }),
      Booking.findAll({
        order: [['created_at', 'DESC']],
        limit: 5,
        include: [
          { model: Customer, as: 'customer', include: [{ model: User, as: 'user', attributes: ['name'] }] },
          { model: Salon, as: 'salon', attributes: ['salon_name'] },
        ],
      }),
      Review.findAll({
        order: [['created_at', 'DESC']],
        limit: 5,
        include: [
          { model: Salon, as: 'salon', attributes: ['salon_name'] },
          { model: Customer, as: 'customer', include: [{ model: User, as: 'user', attributes: ['name'] }] },
        ],
      }),
    ]);

    res.json({ newApplications, newBookings, newReviews });
  } catch (err) {
    next(err);
  }
};
