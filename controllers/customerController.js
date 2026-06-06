const { Op } = require('sequelize');
const { Customer, User } = require('../models');
const AppError = require('../middlewares/AppError');
const { customerRegistryByKey } = require('../config/columnRegistry');

const defaultColumns = ['customer_name', 'email', 'phone', 'gender', 'status', 'created_at'];

exports.query = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.body.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.body.limit, 10) || 20, 1);
    const offset = (page - 1) * limit;
    const where = {};
    if (req.body.status) where.status = req.body.status;

    const userWhere = {};
    if (req.body.search) {
      userWhere[Op.or] = [
        { name: { [Op.iLike]: `%${req.body.search}%` } },
        { email: { [Op.iLike]: `%${req.body.search}%` } },
        { phone: { [Op.iLike]: `%${req.body.search}%` } },
      ];
    }

    const { count, rows } = await Customer.findAndCountAll({
      where,
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'name', 'email', 'phone'],
        where: Object.keys(userWhere).length ? userWhere : undefined,
      }],
      order: [['created_at', 'DESC']],
      limit,
      offset,
    });

    const shaped = rows.map((r) => {
      const p = r.get({ plain: true });
      return {
        ...p,
        customer_name: p.user?.name,
        email: p.user?.email,
        phone: p.user?.phone,
      };
    });

    res.json({
      rows: shaped,
      meta: { total: count, page, limit, totalPages: Math.ceil(count / limit) },
      columns: defaultColumns.map((k) => ({
        key: k,
        label: customerRegistryByKey[k]?.label || k,
        type: customerRegistryByKey[k]?.type || 'string',
      })),
    });
  } catch (err) {
    next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const row = await Customer.findByPk(req.params.id, {
      include: [{ model: User, as: 'user' }],
    });
    if (!row) throw new AppError('Customer not found', 404);
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
};

exports.block = async (req, res, next) => {
  try {
    const row = await Customer.findByPk(req.params.id, { include: [{ model: User, as: 'user' }] });
    if (!row) throw new AppError('Customer not found', 404);
    row.status = 'BLOCKED';
    row.updated_by = req.user.id;
    await row.save();
    if (row.user) {
      row.user.status = 'BLOCKED';
      row.user.is_active = false;
      await row.user.save();
    }
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
};
