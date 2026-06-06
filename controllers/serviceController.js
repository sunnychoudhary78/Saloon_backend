const { Op } = require('sequelize');
const { Service, Salon, ServiceCategory } = require('../models');
const AppError = require('../middlewares/AppError');
const { serviceRegistryByKey } = require('../config/columnRegistry');

const defaultColumns = ['service_name', 'salon_name', 'category_name', 'price', 'duration_minutes', 'status'];

exports.query = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.body.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.body.limit, 10) || 20, 1);
    const offset = (page - 1) * limit;
    const where = {};

    if (req.body.salon_id) where.salon_id = req.body.salon_id;
    if (req.body.search) {
      where.service_name = { [Op.iLike]: `%${req.body.search}%` };
    }

    const { count, rows } = await Service.findAndCountAll({
      where,
      include: [
        { model: Salon, as: 'salon', attributes: ['id', 'salon_name'] },
        { model: ServiceCategory, as: 'category', attributes: ['id', 'name'] },
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
        category_name: p.category?.name,
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
    const { salon_id, category_id, service_name, description, duration_minutes, price, discount_price, status } = req.body;
    if (!salon_id || !category_id || !service_name || price == null) {
      throw new AppError('salon_id, category_id, service_name, and price are required', 400);
    }
    const row = await Service.create({
      salon_id,
      category_id,
      service_name,
      description,
      duration_minutes: duration_minutes || 30,
      price,
      discount_price,
      status: status || 'ACTIVE',
      created_by: req.user.id,
      updated_by: req.user.id,
    });
    res.status(201).json({ data: row });
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const row = await Service.findByPk(req.params.id);
    if (!row) throw new AppError('Service not found', 404);
    const fields = ['category_id', 'service_name', 'description', 'duration_minutes', 'price', 'discount_price', 'status'];
    for (const f of fields) {
      if (req.body[f] !== undefined) row[f] = req.body[f];
    }
    row.updated_by = req.user.id;
    await row.save();
    res.json({ data: row });
  } catch (err) {
    next(err);
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
