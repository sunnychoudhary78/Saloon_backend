const { Op } = require('sequelize');
const { Booking, Customer, Salon, Service, User, sequelize } = require('../models');
const AppError = require('../middlewares/AppError');
const { bookingRegistryByKey } = require('../config/columnRegistry');
const { canTransition } = require('../services/bookingService');
const { logAudit } = require('../services/auditService');
const {
  notifyBookingConfirmed,
  notifyBookingRejected,
  notifyBookingCompleted,
  notifyBookingCancelledForOwner,
  notifyBookingCancelledForCustomer,
} = require('../services/bookingNotificationHelper');

function notifyForAdminStatusChange(bookingId, status) {
  switch (status) {
    case 'ACCEPTED':
      notifyBookingConfirmed(bookingId);
      break;
    case 'REJECTED':
      notifyBookingRejected(bookingId);
      break;
    case 'COMPLETED':
      notifyBookingCompleted(bookingId);
      break;
    case 'CANCELLED':
      notifyBookingCancelledForOwner(bookingId);
      notifyBookingCancelledForCustomer(bookingId);
      break;
    default:
      break;
  }
}

const defaultColumns = ['booking_number', 'customer_name', 'salon_name', 'service_name', 'booking_date', 'booking_status'];

exports.query = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.body.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.body.limit, 10) || 20, 1);
    const offset = (page - 1) * limit;
    const where = {};

    if (req.body.booking_status) where.booking_status = req.body.booking_status;
    if (req.body.salon_id) where.salon_id = req.body.salon_id;
    if (req.body.search) where.booking_number = { [Op.iLike]: `%${req.body.search}%` };

    const { count, rows } = await Booking.findAndCountAll({
      where,
      include: [
        { model: Customer, as: 'customer', include: [{ model: User, as: 'user', attributes: ['name'] }] },
        { model: Salon, as: 'salon', attributes: ['salon_name'] },
        { model: Service, as: 'service', attributes: ['service_name'] },
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset,
    });

    const shaped = rows.map((r) => {
      const p = r.get({ plain: true });
      return {
        ...p,
        customer_name: p.customer?.user?.name,
        salon_name: p.salon?.salon_name,
        service_name: p.service?.service_name,
      };
    });

    res.json({
      rows: shaped,
      meta: { total: count, page, limit, totalPages: Math.ceil(count / limit) },
      columns: defaultColumns.map((k) => ({
        key: k,
        label: bookingRegistryByKey[k]?.label || k,
        type: bookingRegistryByKey[k]?.type || 'string',
      })),
    });
  } catch (err) {
    next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const row = await Booking.findByPk(req.params.id, {
      include: [
        { model: Customer, as: 'customer', include: [{ model: User, as: 'user' }] },
        { model: Salon, as: 'salon' },
        { model: Service, as: 'service' },
      ],
    });
    if (!row) throw new AppError('Booking not found', 404);
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
};

exports.updateStatus = async (req, res, next) => {
  const t = await sequelize.transaction();
  let committed = false;
  try {
    const { booking_status } = req.body;
    const row = await Booking.findByPk(req.params.id, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!row) throw new AppError('Booking not found', 404);
    if (!canTransition(row.booking_status, booking_status)) {
      throw new AppError(`Cannot transition from ${row.booking_status} to ${booking_status}`, 400);
    }
    row.booking_status = booking_status;
    row.responded_by = req.user.id;
    row.responded_at = new Date();
    row.updated_by = req.user.id;
    await row.save({ transaction: t });
    await logAudit({ userId: req.user.id, action: 'booking.updateStatus', entityType: 'Booking', entityId: row.id, req });
    await t.commit();
    committed = true;
    notifyForAdminStatusChange(row.id, booking_status);
    res.json({ data: row });
  } catch (err) {
    if (!committed) await t.rollback();
    next(err);
  }
};
