const { Op } = require('sequelize');
const { ServiceCategory } = require('../models');
const AppError = require('../middlewares/AppError');
const { genericQuery } = require('../services/genericQueryService');
const { serviceCategoryRegistryByKey } = require('../config/columnRegistry');

const defaultColumns = ['name', 'sort_order', 'status', 'created_at'];

exports.query = async (req, res, next) => {
  try {
    const result = await genericQuery(ServiceCategory, req, 'service_categories', defaultColumns, serviceCategoryRegistryByKey);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { name, description, sort_order, status } = req.body;
    if (!name) throw new AppError('Name is required', 400);
    const row = await ServiceCategory.create({
      name,
      description,
      sort_order: sort_order || 0,
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
    const row = await ServiceCategory.findByPk(req.params.id);
    if (!row) throw new AppError('Category not found', 404);
    const { name, description, sort_order, status } = req.body;
    if (name) row.name = name;
    if (description !== undefined) row.description = description;
    if (sort_order !== undefined) row.sort_order = sort_order;
    if (status) row.status = status;
    row.updated_by = req.user.id;
    await row.save();
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
};

exports.makeInactive = async (req, res, next) => {
  try {
    const row = await ServiceCategory.findByPk(req.params.id);
    if (!row) throw new AppError('Category not found', 404);
    row.status = 'INACTIVE';
    row.is_active = false;
    row.updated_by = req.user.id;
    await row.save();
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
};

exports.getAll = async (req, res, next) => {
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
