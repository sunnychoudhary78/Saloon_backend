const bcrypt = require('bcryptjs');
const { User, Role, Department } = require('../models');

exports.createUser = async (req, res) => {
  const { name, email, password, roleId } = req.body;

  try {
    // Determine creator's permissions (loaded on req.user by authMiddleware)
    const creatorPerms = (req.user && req.user.Role && req.user.Role.permissions) ? req.user.Role.permissions.map(p => p.name) : [];

    // If a roleId is provided, ensure creator has role.assign permission
    let role;
    if (roleId) {
      if (!creatorPerms.includes('role.assign')) {
        return res.status(403).json({ message: 'Forbidden: cannot assign roles' });
      }

      role = await Role.findOne({ where: { id: roleId } });
      if (!role) return res.status(400).json({ message: 'Role not found' });
    } else {
      // default to 'Employee' role if not specified
      role = await Role.findOne({ where: { name: 'Employee' } });
      if (!role) return res.status(500).json({ message: "Default role 'Employee' not found" });
    }


    // Hash password if provided
    let hashedPassword = null;
    if (password) {
      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(password, salt);
    }

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      roleId: role.id,
      created_by: req.user.id
    });
    res.status(201).json({ message: 'User created', user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const { limit, offset } = req.query;

    const users = await User.findAll({ include: [Role], limit, offset });
    res.json({ users });
  } catch (err) {
    console.error('getAllUsers error', err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: 'User id required' });

    const user = await User.findByPk(id, {
      include: [Role],
      attributes: { exclude: ['password'] }
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
    if (!editorId) return res.status(401).json({ message: 'Unauthorized' });

    const { id } = req.params;
    if (!id) return res.status(400).json({ message: 'User id required' });

    const { name, email, roleId } = req.body || {};
    const user = await User.findByPk(id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (email) {
      const exists = await User.findOne({ where: { email } });
      if (exists && String(exists.id) !== String(user.id)) {
        return res.status(400).json({ message: 'Email already in use' });
      }
    }

    let roleToAssign = null;
    if (roleId) {
      roleToAssign = await Role.findByPk(roleId);
      if (!roleToAssign) return res.status(400).json({ message: 'Role not found' });
    }

    user.name = typeof name === 'string' ? name : user.name;
    user.email = typeof email === 'string' ? email : user.email;
    if (roleToAssign) user.roleId = roleToAssign.id;
    user.updated_by = editorId;
    user.updated_at = new Date();
    await user.save();

    const updated = await User.findByPk(id, {
      include: [Role],
      attributes: { exclude: ['password'] }
    });

    return res.json({ message: 'User updated', user: updated });
  } catch (err) {
    console.error('updateUser error', err);
    return res.status(500).json({ message: 'Server error' });
  }
};
