const { Service, Salon } = require('../models');
const AppError = require('../middlewares/AppError');
const { serviceRegistryByKey } = require('../config/columnRegistry');
const {
  assertUniqueServiceIdentity,
  mapServiceIdentityConflict,
} = require('../services/serviceIdentityService');
const { ilikeOr } = require('../utils/adminSearch');

const defaultColumns = ['service_name', 'salon_name', 'description', 'price', 'duration_minutes', 'status'];

exports.query = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.body.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.body.limit, 10) || 20, 1);
    const offset = (page - 1) * limit;
    const where = {};

    if (req.body.salon_id) where.salon_id = req.body.salon_id;
    const searchOr = ilikeOr(
      ['service_name', 'description', '$salon.salon_name$'],
      req.body.search,
    );
    if (searchOr) Object.assign(where, searchOr);

    const { count, rows } = await Service.findAndCountAll({
      where,
      include: [{ model: Salon, as: 'salon', attributes: ['id', 'salon_name'] }],
      order: [['created_at', 'DESC']],
      limit,
      offset,
      distinct: true,
      subQuery: false,
    });

    const shaped = rows.map((r) => {
      const p = r.get({ plain: true });
      return {
        ...p,
        salon_name: p.salon?.salon_name,
      };
    });

    res.json({
      rows: shaped,
      meta: { total: count, page, limit, totalPages: Math.ceil(count / limit) },
      columns: defaultColumns.map((k) => ({
        key: k,
        label: serviceRegistryByKey[k]?.label || k,
        type: serviceRegistryByKey[k]?.type || 'string',
      })),
    });
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { salon_id, service_name, description, duration_minutes, price, discount_price, status } = req.body;
    const normalizedName = String(service_name || '').trim();
    const normalizedDescription = description ? String(description).trim() : null;
    if (!salon_id || !normalizedName || price == null) {
      throw new AppError('salon_id, service_name, and price are required', 400);
    }
    await assertUniqueServiceIdentity({
      salonId: salon_id,
      serviceName: normalizedName,
      description: normalizedDescription,
      price,
    });
    const row = await Service.create({
      salon_id,
      service_name: normalizedName,
      description: normalizedDescription,
      duration_minutes: duration_minutes || 30,
      price,
      discount_price,
      status: status || 'ACTIVE',
      created_by: req.user.id,
      updated_by: req.user.id,
    });
    res.status(201).json({ data: row });
  } catch (err) {
    next(mapServiceIdentityConflict(err));
  }
};

exports.update = async (req, res, next) => {
  try {
    const row = await Service.findByPk(req.params.id);
    if (!row) throw new AppError('Service not found', 404);
    const fields = ['service_name', 'description', 'duration_minutes', 'price', 'discount_price', 'status'];
    for (const f of fields) {
      if (req.body[f] !== undefined) row[f] = req.body[f];
    }
    row.service_name = String(row.service_name || '').trim();
    row.description = row.description ? String(row.description).trim() : null;
    if (!row.service_name) throw new AppError('service_name is required', 400);
    await assertUniqueServiceIdentity({
      salonId: row.salon_id,
      serviceName: row.service_name,
      description: row.description,
      price: row.price,
      excludeId: row.id,
    });
    row.updated_by = req.user.id;
    await row.save();
    res.json({ data: row });
  } catch (err) {
    next(mapServiceIdentityConflict(err));
  }
};

exports.makeInactive = async (req, res, next) => {
  try {
    const row = await Service.findByPk(req.params.id);
    if (!row) throw new AppError('Service not found', 404);
    row.status = 'INACTIVE';
    row.is_active = false;
    row.updated_by = req.user.id;
    await row.save();
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
};
