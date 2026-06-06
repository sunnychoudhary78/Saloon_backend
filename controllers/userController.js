const bcrypt = require('bcryptjs');
const { User, Role, UserRole } = require('../models');
const { getUnionPermissions } = require('../utils/authHelpers');

exports.createUser = async (req, res) => {
  const { name, email, password, phone, roleIds } = req.body;

  try {
    const creatorPerms = getUnionPermissions(req.user).map((p) => p.name);

    let roles = [];
    if (roleIds && roleIds.length) {
      if (!creatorPerms.includes('role.assign')) {
        return res.status(403).json({ message: 'Forbidden: cannot assign roles' });
      }
      roles = await Role.findAll({ where: { id: roleIds } });
      if (roles.length !== roleIds.length) {
        return res.status(400).json({ message: 'One or more roles not found' });
      }
    } else {
      const adminRole = await Role.findOne({ where: { name: 'ADMIN' } });
      if (!adminRole) return res.status(500).json({ message: "Default role 'ADMIN' not found" });
      roles = [adminRole];
    }

    let hashedPassword = null;
    if (password) {
      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(password, salt);
    }

    const user = await User.create({
      name,
      email,
      phone: phone || null,
      password: hashedPassword,
      status: 'ACTIVE',
      created_by: req.user.id,
    });

    for (const role of roles) {
      await UserRole.create({
        user_id: user.id,
        role_id: role.id,
        assigned_by: req.user.id,
        assigned_at: new Date(),
      });
    }

    res.status(201).json({ message: 'User created', user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const { limit, offset } = req.query;
    const users = await User.findAll({
      include: [{ model: Role, as: 'Roles', through: { attributes: [] } }],
      limit,
      offset,
      attributes: { exclude: ['password'] },
    });
    res.json({ users });
  } catch (err) {
    console.error('getAllUsers error', err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findByPk(id, {
      include: [{ model: Role, as: 'Roles', through: { attributes: [] } }],
      attributes: { exclude: ['password'] },
    });
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.json({ user });
  } catch (err) {
    console.error('getUserById error', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const editorId = req.user && req.user.id;
    const { id } = req.params;
    const { name, email, phone, roleIds, status } = req.body || {};

    const user = await User.findByPk(id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (email) {
      const exists = await User.findOne({ where: { email } });
      if (exists && String(exists.id) !== String(user.id)) {
        return res.status(400).json({ message: 'Email already in use' });
      }
    }

    if (name) user.name = name;
    if (email) user.email = email;
    if (phone !== undefined) user.phone = phone;
    if (status) {
      user.status = status;
      user.is_active = status === 'ACTIVE';
    }
    user.updated_by = editorId;
    await user.save();

    if (roleIds && Array.isArray(roleIds)) {
      const creatorPerms = getUnionPermissions(req.user).map((p) => p.name);
      if (!creatorPerms.includes('role.assign')) {
        return res.status(403).json({ message: 'Forbidden: cannot assign roles' });
      }
      await UserRole.destroy({ where: { user_id: user.id } });
      for (const roleId of roleIds) {
        await UserRole.create({
          user_id: user.id,
          role_id: roleId,
          assigned_by: editorId,
          assigned_at: new Date(),
        });
      }
    }

    const updated = await User.findByPk(id, {
      include: [{ model: Role, as: 'Roles', through: { attributes: [] } }],
      attributes: { exclude: ['password'] },
    });

    return res.json({ message: 'User updated', user: updated });
  } catch (err) {
    console.error('updateUser error', err);
    return res.status(500).json({ message: 'Server error' });
  }
};
