const { Op } = require('sequelize');
const { Customer, User, Role, SalonOwner } = require('../models');
const AppError = require('../middlewares/AppError');
const { customerRegistryByKey } = require('../config/columnRegistry');
const { ilikeOr } = require('../utils/adminSearch');
const { getMobileAccountType, getEligibleMobileUserIds } = require('../utils/authHelpers');

const defaultColumns = [
  'customer_name',
  'email',
  'phone',
  'gender',
  'account_type',
  'status',
  'created_at',
];

exports.query = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.body.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.body.limit, 10) || 20, 1);
    const offset = (page - 1) * limit;
    const accountType = req.body.account_type;
    const columns = defaultColumns.map((k) => ({
      key: k,
      label: customerRegistryByKey[k]?.label || k,
      type: customerRegistryByKey[k]?.type || 'string',
    }));

    const ids = await getEligibleMobileUserIds(
      accountType === 'customer' || accountType === 'salon_owner' ? accountType : null
    );

    if (!ids.length) {
      return res.json({
        rows: [],
        meta: { total: 0, page, limit, totalPages: 0 },
        columns,
      });
    }

    const where = { user_id: { [Op.in]: ids } };
    if (req.body.status) where.status = req.body.status;

    const searchOr = ilikeOr(
      ['gender', '$user.name$', '$user.email$', '$user.phone$'],
      req.body.search,
    );
    if (searchOr) Object.assign(where, searchOr);

    const { count, rows } = await Customer.findAndCountAll({
      where,
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'name', 'email', 'phone'],
        include: [
          { model: Role, as: 'Roles', through: { attributes: [] } },
          { model: SalonOwner, as: 'salon_owner', required: false },
        ],
      }],
      order: [['created_at', 'DESC']],
      limit,
      offset,
      distinct: true,
      subQuery: false,
    });

    const shaped = rows.map((r) => {
      const p = r.get({ plain: true });
      const names = (p.user?.Roles || []).map((role) => role.name);
      const salonOwner = p.user?.salon_owner || null;
      const { account_type, account_type_key } = getMobileAccountType(names, salonOwner);
      return {
        id: p.id,
        user_id: p.user_id || p.user?.id,
        customer_name: p.user?.name,
        email: p.user?.email,
        phone: p.user?.phone,
        gender: p.gender,
        account_type,
        account_type_key,
        business_name: salonOwner?.business_name || null,
        has_owner_profile: Boolean(salonOwner),
        status: p.status,
        created_at: p.created_at,
      };
    });

    res.json({
      rows: shaped,
      meta: { total: count, page, limit, totalPages: Math.ceil(count / limit) },
      columns,
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

exports.unblock = async (req, res, next) => {
  try {
    const row = await Customer.findByPk(req.params.id, { include: [{ model: User, as: 'user' }] });
    if (!row) throw new AppError('Customer not found', 404);
    row.status = 'ACTIVE';
    row.updated_by = req.user.id;
    await row.save();
    if (row.user) {
      row.user.status = 'ACTIVE';
      row.user.is_active = true;
      await row.user.save();
    }
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
};
