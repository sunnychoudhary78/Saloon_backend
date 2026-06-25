const { Op } = require('sequelize');
const { UserNotification } = require('../models');
const AppError = require('../middlewares/AppError');

function shapeNotification(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    data: row.data || {},
    read_at: row.read_at,
    created_at: row.created_at,
  };
}

exports.listNotifications = async (req, res, next) => {
  try {
    const page = req.query.page || 1;
    const limit = req.query.limit || 20;
    const offset = (page - 1) * limit;

    const { rows, count } = await UserNotification.findAndCountAll({
      where: { user_id: req.user.id },
      order: [['created_at', 'DESC']],
      limit,
      offset,
    });

    const total = Number(count) || 0;
    res.json({
      data: rows.map(shapeNotification),
      meta: {
        page: Number(page) || 1,
        limit: Number(limit) || 20,
        total,
        total_pages: Math.ceil(total / limit) || 0,
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.getUnreadCount = async (req, res, next) => {
  try {
    const count = await UserNotification.count({
      where: { user_id: req.user.id, read_at: null },
    });
    res.json({ count });
  } catch (err) {
    next(err);
  }
};

exports.markRead = async (req, res, next) => {
  try {
    const row = await UserNotification.findOne({
      where: { id: req.params.id, user_id: req.user.id },
    });
    if (!row) throw new AppError('Notification not found', 404);
    if (!row.read_at) {
      row.read_at = new Date();
      await row.save();
    }
    res.json({ data: shapeNotification(row) });
  } catch (err) {
    next(err);
  }
};

exports.markAllRead = async (req, res, next) => {
  try {
    const now = new Date();
    const [updated] = await UserNotification.update(
      { read_at: now, updated_at: now },
      { where: { user_id: req.user.id, read_at: null } },
    );
    res.json({ updated });
  } catch (err) {
    next(err);
  }
};
