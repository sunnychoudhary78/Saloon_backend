const { Op } = require('sequelize');
const {
  Payment,
  PaymentLineItem,
  Booking,
  Customer,
  Salon,
  User,
} = require('../models');
const { shapePayment } = require('../services/paymentService');

exports.query = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.body.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.body.limit, 10) || 20, 1);
    const offset = (page - 1) * limit;
    const where = {};

    if (req.body.status) where.status = req.body.status;
    if (req.body.checkout_kind) where.checkout_kind = req.body.checkout_kind;
    if (req.body.salon_id) where.salon_id = req.body.salon_id;
    if (req.body.booking_group_id) where.booking_group_id = req.body.booking_group_id;

    const { count, rows } = await Payment.findAndCountAll({
      where,
      include: [
        { model: PaymentLineItem, as: 'line_items' },
        { model: Salon, as: 'salon', attributes: ['id', 'salon_name'] },
        { model: Customer, as: 'customer', include: [{ model: User, as: 'user', attributes: ['name'] }] },
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset,
    });

    res.json({
      rows: rows.map((r) => shapePayment(r.get({ plain: true }))),
      meta: { total: count, page, limit, totalPages: Math.ceil(count / limit) },
    });
  } catch (err) {
    next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const payment = await Payment.findByPk(req.params.id, {
      include: [
        { model: PaymentLineItem, as: 'line_items' },
        { model: Salon, as: 'salon', attributes: ['id', 'salon_name'] },
        { model: Booking, as: 'booking' },
      ],
    });
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    res.json({ data: shapePayment(payment) });
  } catch (err) {
    next(err);
  }
};
