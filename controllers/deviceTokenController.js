const { DeviceToken } = require('../models');
const AppError = require('../middlewares/AppError');

exports.registerDeviceToken = async (req, res, next) => {
  try {
    const { token, platform } = req.body;
    const userId = req.user.id;

    const existing = await DeviceToken.findOne({ where: { token } });
    if (existing) {
      await existing.update({ user_id: userId, platform, updated_at: new Date() });
      return res.status(200).json({ data: existing });
    }

    const row = await DeviceToken.create({
      user_id: userId,
      token,
      platform,
    });
    res.status(201).json({ data: row });
  } catch (err) {
    next(err);
  }
};

exports.unregisterDeviceToken = async (req, res, next) => {
  try {
    const { token } = req.body;
    const deleted = await DeviceToken.destroy({
      where: { token, user_id: req.user.id },
    });
    if (!deleted) {
      throw new AppError('Device token not found', 404);
    }
    res.json({ message: 'Device token removed' });
  } catch (err) {
    next(err);
  }
};
