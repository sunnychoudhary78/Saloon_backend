const { Op } = require('sequelize');
const { SalonApplication, SalonOwner, User } = require('../models');
const AppError = require('../middlewares/AppError');
const { salonApplicationRegistryByKey } = require('../config/columnRegistry');
const { approveApplication, rejectApplication } = require('../services/salonApplicationService');

const defaultColumns = ['salon_name', 'application_type', 'city', 'state', 'application_status', 'owner_name', 'created_at'];

exports.query = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.body.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.body.limit, 10) || 20, 1);
    const offset = (page - 1) * limit;
    const where = {};

    if (req.body.application_status) where.application_status = req.body.application_status;
    if (req.body.application_type) where.application_type = req.body.application_type;
    if (req.body.search) {
      where[Op.or] = [
        { salon_name: { [Op.iLike]: `%${req.body.search}%` } },
        { city: { [Op.iLike]: `%${req.body.search}%` } },
      ];
    }

    const { count, rows } = await SalonApplication.findAndCountAll({
      where,
      include: [{
        model: SalonOwner,
        as: 'owner',
        include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }],
      }],
      order: [['created_at', 'DESC']],
      limit,
      offset,
    });

    const shaped = rows.map((r) => {
      const p = r.get({ plain: true });
      return { ...p, owner_name: p.owner?.user?.name };
    });

    res.json({
      rows: shaped,
      meta: { total: count, page, limit, totalPages: Math.ceil(count / limit) },
      columns: defaultColumns.map((k) => ({
        key: k,
        label: salonApplicationRegistryByKey[k]?.label || k,
        type: salonApplicationRegistryByKey[k]?.type || 'string',
      })),
    });
  } catch (err) {
    next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const row = await SalonApplication.findByPk(req.params.id, {
      include: [{
        model: SalonOwner,
        as: 'owner',
        include: [{ model: User, as: 'user' }],
      }],
    });
    if (!row) throw new AppError('Application not found', 404);
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
};

exports.approve = async (req, res, next) => {
  try {
    const result = await approveApplication(req.params.id, req.user.id, req);
    res.json({ message: 'Application approved', data: result });
  } catch (err) {
    next(new AppError(err.message, 400));
  }
};

exports.reject = async (req, res, next) => {
  try {
    const { rejection_reason } = req.body;
    if (!rejection_reason) throw new AppError('Rejection reason is required', 400);
    const result = await rejectApplication(req.params.id, req.user.id, rejection_reason, req);
    res.json({ message: 'Application rejected', data: result });
  } catch (err) {
    next(new AppError(err.message, 400));
  }
};
