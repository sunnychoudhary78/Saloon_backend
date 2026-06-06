const { Op } = require('sequelize');
const { Review, Customer, Salon, User, Booking } = require('../models');
const AppError = require('../middlewares/AppError');
const { reviewRegistryByKey } = require('../config/columnRegistry');
const { logAudit } = require('../services/auditService');

const defaultColumns = ['salon_name', 'customer_name', 'rating', 'review', 'status', 'created_at'];

exports.query = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.body.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.body.limit, 10) || 20, 1);
    const offset = (page - 1) * limit;
    const where = {};
    if (req.body.status) where.status = req.body.status;

    const { count, rows } = await Review.findAndCountAll({
      where,
      include: [
        { model: Salon, as: 'salon', attributes: ['salon_name'] },
        { model: Customer, as: 'customer', include: [{ model: User, as: 'user', attributes: ['name'] }] },
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset,
    });

    const shaped = rows.map((r) => {
      const p = r.get({ plain: true });
      return {
        ...p,
        salon_name: p.salon?.salon_name,
        customer_name: p.customer?.user?.name,
      };
    });

    res.json({
      rows: shaped,
      meta: { total: count, page, limit, totalPages: Math.ceil(count / limit) },
      columns: defaultColumns.map((k) => ({
        key: k,
        label: reviewRegistryByKey[k]?.label || k,
        type: reviewRegistryByKey[k]?.type || 'string',
      })),
    });
  } catch (err) {
    next(err);
  }
};

exports.publish = async (req, res, next) => {
  try {
    const row = await Review.findByPk(req.params.id);
    if (!row) throw new AppError('Review not found', 404);
    row.status = 'PUBLISHED';
    row.moderated_by = req.user.id;
    row.updated_by = req.user.id;
    await row.save();
    await logAudit({ userId: req.user.id, action: 'review.publish', entityType: 'Review', entityId: row.id, req });
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
};

exports.hide = async (req, res, next) => {
  try {
    const row = await Review.findByPk(req.params.id);
    if (!row) throw new AppError('Review not found', 404);
    row.status = 'HIDDEN';
    row.moderated_by = req.user.id;
    row.updated_by = req.user.id;
    await row.save();
    await logAudit({ userId: req.user.id, action: 'review.hide', entityType: 'Review', entityId: row.id, req });
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
};
