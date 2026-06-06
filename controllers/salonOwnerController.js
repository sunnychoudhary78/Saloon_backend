const { Op } = require('sequelize');
const { SalonOwner, User } = require('../models');
const AppError = require('../middlewares/AppError');
const { genericQuery } = require('../services/genericQueryService');
const { salonOwnerRegistryByKey } = require('../config/columnRegistry');
const { logAudit } = require('../services/auditService');

const defaultColumns = ['business_name', 'gst_number', 'status', 'owner_name', 'owner_email', 'created_at'];

exports.query = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.body.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.body.limit, 10) || 20, 1);
    const offset = (page - 1) * limit;
    const search = req.body.search || '';

    const where = {};
    if (search) {
      where[Op.or] = [
        { business_name: { [Op.iLike]: `%${search}%` } },
        { gst_number: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const { count, rows } = await SalonOwner.findAndCountAll({
      where,
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'phone'] }],
      order: [['created_at', 'DESC']],
      limit,
      offset,
    });

    const shaped = rows.map((r) => {
      const p = r.get({ plain: true });
      return {
        ...p,
        owner_name: p.user?.name,
        owner_email: p.user?.email,
      };
    });

    res.json({
      rows: shaped,
      meta: { total: count, page, limit, totalPages: Math.ceil(count / limit) },
      columns: defaultColumns.map((k) => ({
        key: k,
        label: salonOwnerRegistryByKey[k]?.label || k,
        type: salonOwnerRegistryByKey[k]?.type || 'string',
      })),
    });
  } catch (err) {
    next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const row = await SalonOwner.findByPk(req.params.id, {
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'phone'] }],
    });
    if (!row) throw new AppError('Salon owner not found', 404);
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const row = await SalonOwner.findByPk(req.params.id);
    if (!row) throw new AppError('Salon owner not found', 404);

    const { business_name, gst_number, status } = req.body;
    if (business_name) row.business_name = business_name;
    if (gst_number !== undefined) row.gst_number = gst_number;
    if (status) row.status = status;
    row.updated_by = req.user.id;
    await row.save();

    await logAudit({
      userId: req.user.id,
      action: 'salonOwner.update',
      entityType: 'SalonOwner',
      entityId: row.id,
      req,
    });

    res.json({ data: row });
  } catch (err) {
    next(err);
  }
};

exports.block = async (req, res, next) => {
  try {
    const row = await SalonOwner.findByPk(req.params.id);
    if (!row) throw new AppError('Salon owner not found', 404);
    row.status = 'BLOCKED';
    row.updated_by = req.user.id;
    await row.save();
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
};
