const { Op } = require('sequelize');
const { Salon, SalonOwner, User } = require('../models');
const AppError = require('../middlewares/AppError');
const { salonRegistryByKey } = require('../config/columnRegistry');
const { logAudit } = require('../services/auditService');

const defaultColumns = ['salon_name', 'city', 'state', 'status', 'owner_name', 'created_at'];

exports.query = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.body.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.body.limit, 10) || 20, 1);
    const offset = (page - 1) * limit;
    const where = {};

    if (req.body.status) where.status = req.body.status;
    if (req.body.search) {
      where[Op.or] = [
        { salon_name: { [Op.iLike]: `%${req.body.search}%` } },
        { city: { [Op.iLike]: `%${req.body.search}%` } },
      ];
    }

    const { count, rows } = await Salon.findAndCountAll({
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
        label: salonRegistryByKey[k]?.label || k,
        type: salonRegistryByKey[k]?.type || 'string',
      })),
    });
  } catch (err) {
    next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const row = await Salon.findByPk(req.params.id, {
      include: [{
        model: SalonOwner,
        as: 'owner',
        include: [{ model: User, as: 'user' }],
      }],
    });
    if (!row) throw new AppError('Salon not found', 404);
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const row = await Salon.findByPk(req.params.id);
    if (!row) throw new AppError('Salon not found', 404);

    const fields = ['salon_name', 'description', 'address', 'city', 'state', 'latitude', 'longitude', 'cover_image', 'gallery_images', 'opening_time', 'closing_time', 'status'];
    for (const f of fields) {
      if (req.body[f] !== undefined) row[f] = req.body[f];
    }
    row.updated_by = req.user.id;
    await row.save();

    await logAudit({ userId: req.user.id, action: 'salon.update', entityType: 'Salon', entityId: row.id, req });
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
};

exports.suspend = async (req, res, next) => {
  try {
    const row = await Salon.findByPk(req.params.id);
    if (!row) throw new AppError('Salon not found', 404);
    row.status = 'SUSPENDED';
    row.updated_by = req.user.id;
    await row.save();
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
};

exports.close = async (req, res, next) => {
  try {
    const row = await Salon.findByPk(req.params.id);
    if (!row) throw new AppError('Salon not found', 404);
    row.status = 'CLOSED';
    row.updated_by = req.user.id;
    await row.save();
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
};
