const { Op } = require('sequelize');
const { AuditLog, User } = require('../models');
const { auditLogRegistryByKey } = require('../config/columnRegistry');

const defaultColumns = ['action', 'entity_type', 'user_name', 'created_at'];

exports.query = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.body.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.body.limit, 10) || 20, 1);
    const offset = (page - 1) * limit;
    const where = {};

    if (req.body.entity_type) where.entity_type = req.body.entity_type;
    if (req.body.search) {
      where[Op.or] = [
        { action: { [Op.iLike]: `%${req.body.search}%` } },
        { entity_type: { [Op.iLike]: `%${req.body.search}%` } },
      ];
    }

    const { count, rows } = await AuditLog.findAndCountAll({
      where,
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }],
      order: [['created_at', 'DESC']],
      limit,
      offset,
    });

    const shaped = rows.map((r) => {
      const p = r.get({ plain: true });
      return { ...p, user_name: p.user?.name };
    });

    res.json({
      rows: shaped,
      meta: { total: count, page, limit, totalPages: Math.ceil(count / limit) },
      columns: defaultColumns.map((k) => ({
        key: k,
        label: auditLogRegistryByKey[k]?.label || k,
        type: auditLogRegistryByKey[k]?.type || 'string',
      })),
    });
  } catch (err) {
    next(err);
  }
};
