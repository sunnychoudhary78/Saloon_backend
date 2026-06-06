const { PlatformSetting } = require('../models');
const AppError = require('../middlewares/AppError');
const { logAudit } = require('../services/auditService');

exports.getAll = async (req, res, next) => {
  try {
    const rows = await PlatformSetting.findAll({ where: { is_active: true }, order: [['setting_key', 'ASC']] });
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { setting_key } = req.params;
    const { setting_value, description } = req.body;

    let row = await PlatformSetting.findOne({ where: { setting_key } });
    if (!row) {
      row = await PlatformSetting.create({
        setting_key,
        setting_value: setting_value || {},
        description,
        created_by: req.user.id,
        updated_by: req.user.id,
      });
    } else {
      if (setting_value !== undefined) row.setting_value = setting_value;
      if (description !== undefined) row.description = description;
      row.updated_by = req.user.id;
      await row.save();
    }

    await logAudit({ userId: req.user.id, action: 'platformSetting.update', entityType: 'PlatformSetting', entityId: row.id, req });
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
};
