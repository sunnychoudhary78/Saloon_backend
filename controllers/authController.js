const bcrypt = require('bcryptjs');
const { User, Role, sequelize } = require('../models');
const {
  generateToken,
  loadUserWithRoles,
  getUnionPermissions,
  shapeUserResponse,
  hasAdminAccess,
} = require('../utils/authHelpers');

exports.generateToken = generateToken;

exports.login = async (req, res) => {
  const emailRaw = (req.body || {}).email;
  const password = (req.body || {}).password;
  const identifier = typeof emailRaw === 'string' ? emailRaw.trim() : '';

  try {
    if (!identifier) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const user = await User.findOne({
      where: { email: identifier },
      include: [{ model: Role, as: 'Roles', through: { attributes: [] } }],
    });

    if (!user) return res.status(401).json({ message: 'Invalid credentials' });
    if (!user.is_active || user.status === 'BLOCKED') {
      return res.status(403).json({ message: 'Account is blocked. Please contact support.' });
    }
    if (!user.password) return res.status(400).json({ message: 'Use OAuth to login' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

    const fullUser = await loadUserWithRoles(user.id);
    const token = generateToken(fullUser);
    const userData = shapeUserResponse(fullUser);

    res.json({ token, user: userData });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getPermissions = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

    const permissions = getUnionPermissions(req.user).map((p) => ({
      id: p.id,
      name: p.name,
      displayName: p.displayName,
      description: p.description,
    }));

    return res.json({ permissions });
  } catch (err) {
    console.error('getPermissions error', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.getMe = async (req, res) => {
  try {
    const user = await loadUserWithRoles(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    return res.json({ user: shapeUserResponse(user) });
  } catch (err) {
    console.error('getMe error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.changePassword = async (req, res) => {
  const authUserId = req.user && req.user.id;
  if (!authUserId) return res.status(401).json({ message: 'Unauthorized' });

  const { currentPassword, newPassword, confirmPassword } = req.body || {};

  if (!newPassword || !confirmPassword) {
    return res.status(400).json({ message: 'newPassword and confirmPassword are required' });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ message: 'New password and confirm password do not match' });
  }
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({ message: 'New password must be at least 8 characters long' });
  }

  const t = await sequelize.transaction();
  try {
    const user = await User.findOne({
      where: { id: authUserId },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!user) {
      await t.rollback();
      return res.status(404).json({ message: 'User not found' });
    }
    if (user.password) {
      if (!currentPassword) {
        await t.rollback();
        return res.status(400).json({ message: 'currentPassword is required' });
      }
      const match = await bcrypt.compare(currentPassword, user.password);
      if (!match) {
        await t.rollback();
        return res.status(401).json({ message: 'Current password is incorrect' });
      }
      const isSameAsOld = await bcrypt.compare(newPassword, user.password);
      if (isSameAsOld) {
        await t.rollback();
        return res.status(400).json({ message: 'New password must be different from the current password' });
      }
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.updated_by = authUserId;
    await user.save({ transaction: t });
    await t.commit();

    return res.status(200).json({ message: 'Password changed successfully' });
  } catch (err) {
    await t.rollback().catch(() => {});
    console.error('changePassword error', err);
    return res.status(500).json({ message: 'Failed to change password' });
  }
};

exports.adminChangePassword = async (req, res) => {
  try {
    const { userId, newPassword } = req.body || {};
    if (!userId || !newPassword) {
      return res.status(400).json({ message: 'userId and newPassword are required' });
    }
    if (typeof newPassword !== 'string' || !/^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(newPassword)) {
      return res.status(400).json({ message: 'Password must be 8+ chars, include uppercase, number, and special character' });
    }

    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    return res.status(200).json({ ok: true, message: 'Password updated' });
  } catch (err) {
    console.error('adminChangePassword error', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.adminPanelAccessCheck = (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  if (!hasAdminAccess(req.user)) {
    return res.status(403).json({ message: 'Admin panel access denied' });
  }
  next();
};
