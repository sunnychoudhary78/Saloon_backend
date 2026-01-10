const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, Role, Permission, Department, sequelize, EmployeeDetail, Company } = require('../models');

exports.generateToken = (user) => {
  return jwt.sign(
    { id: user.id, roleId: user.roleId, departmentId: user.departmentId },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
};

// Email or Payroll Code + Password login
exports.login = async (req, res) => {
  const emailRaw = (req.body || {}).email;
  const password = (req.body || {}).password;
  const identifier = typeof emailRaw === 'string' ? emailRaw.trim() : '';

  try {
    let user = null;

    if (identifier) {
      user = await User.findOne({ 
        where: { email: identifier }, 
        include: [
          Role,
          { 
            model: EmployeeDetail, 
            as: 'employee_detail',
            include: [{ model: Company, as: 'company' }]
          }
        ] 
      });
      if (!user) {
        const { EmployeeDetail } = require('../models');
        const { Op } = require('sequelize');
        const emp = await EmployeeDetail.findOne({ where: { payroll_code: { [Op.iLike]: identifier } } });
        if (emp && emp.user_id) {
          user = await User.findOne({ 
            where: { id: emp.user_id }, 
            include: [
              Role,
              { 
                model: EmployeeDetail, 
                as: 'employee_detail',
                include: [{ model: Company, as: 'company' }]
              }
            ] 
          });
        }
      }
    }

    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    if (!user.is_active) return res.status(403).json({ message: 'Account is inactive. Please contact your administrator.' });

    if (!user.password) return res.status(400).json({ message: 'Use OAuth to login' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

    const token = exports.generateToken(user);

    // Fetch permissions for the user's role
    let permissions = [];
    try {
      const perms = await Permission.findAll({
        include: [
          {
            model: Role,
            as: 'roles',
            where: { id: user.roleId },
            attributes: [],
            through: { attributes: [] }
          }
        ],
        attributes: ['id', 'name', 'displayName', 'description']
      });

      permissions = perms.map(p => ({
        id: p.id,
        name: p.name,
        displayName: p.displayName,
        description: p.description
      }));
    } catch (e) {
      console.error('Failed to load permissions for role', e);
    }

    const userData = {
      id: user.id,
      email: user.email,
      name: user.name,
      roleId: user.roleId,
      departmentId: user.departmentId,
      companyId: user.employee_detail ? user.employee_detail.company_id : null,
      companyName: user.employee_detail?.company ? user.employee_detail.company.name : null,
      role: user.Role ? {
        id: user.Role.id,
        name: user.Role.name
      } : null,
    };

    res.json({ token, user: userData });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Return permissions for the authenticated user's role
exports.getPermissions = async (req, res) => {
  try {
    // authMiddleware sets req.user
    const user = req.user;
    if (!user) return res.status(401).json({ message: 'Unauthorized' });

    // Fetch permissions for the user's role
    const perms = await Permission.findAll({
      include: [
        {
          model: Role,
          as: 'roles',
          where: { id: user.roleId },
          attributes: [],
          through: { attributes: [] }
        }
      ],
      attributes: ['id', 'name', 'displayName', 'description']
    });

    const permissions = perms.map(p => ({
      id: p.id,
      name: p.name,
      displayName: p.displayName,
      description: p.description
    }));

    return res.json({ permissions });
  } catch (err) {
    console.error('getPermissions error', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Return authenticated user's profile with role, department, and permissions
exports.getMe = async (req, res) => {
  try {
    // req.user is set by authMiddleware but we want to re-fetch to ensure fresh data
    const user = await User.findByPk(req.user.id, {
      include: [
        {
          model: Role,
          include: [
            {
              model: Permission,
              as: 'permissions',
              through: { attributes: [] },
              attributes: ['id', 'name', 'displayName', 'description']
            }
          ]
        },
        { 
          model: EmployeeDetail, 
          as: 'employee_detail',
          include: [{ model: Company, as: 'company' }]
        }
      ],
      attributes: ['id', 'name', 'email', 'roleId', 'is_active', 'created_at', 'updated_at']
    });

    if (!user) return res.status(404).json({ message: 'User not found' });

    const userData = {
      id: user.id,
      name: user.name,
      email: user.email,
      roleId: user.roleId,
      departmentId: user.departmentId,
      active: user.active,
      created_at: user.created_at,
      updated_at: user.updated_at,
      companyId: user.employee_detail ? user.employee_detail.company_id : null,
      companyName: user.employee_detail?.company ? user.employee_detail.company.name : null,
      role: user.Role ? {
        id: user.Role.id,
        name: user.Role.name,
        permissions: user.Role.permissions
      } : null,
      department: user.Department ? {
        id: user.Department.id,
        name: user.Department.name
      } : null
    };

    return res.json({ user: userData });
  } catch (err) {
    console.error('getMe error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

exports.changePassword = async (req, res) => {
  const authUserId = req.user && req.user.id;
  if (!authUserId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { currentPassword, newPassword, confirmPassword } = req.body || {};

  // Basic validation
  if (!currentPassword || !newPassword || !confirmPassword) {
    return res.status(400).json({ message: 'currentPassword, newPassword and confirmPassword are required' });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ message: 'New password and confirm password do not match' });
  }

  // Minimal strength check — adjust to your policy
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({ message: 'New password must be at least 8 characters long' });
  }

  const t = await sequelize.transaction();
  try {
    // lock the user row to avoid race conditions
    const user = await User.findOne({
      where: { id: authUserId },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!user) {
      await t.rollback();
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.password) {
      // account may be oauth-only or password-less
      await t.rollback();
      return res.status(400).json({ message: 'Password change not supported for this account' });
    }

    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) {
      await t.rollback();
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    // prevent reusing same password (optional)
    const isSameAsOld = await bcrypt.compare(newPassword, user.password);
    if (isSameAsOld) {
      await t.rollback();
      return res.status(400).json({ message: 'New password must be different from the current password' });
    }

    // hash and save
    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(newPassword, salt);

    user.password = hashed;
    // if you track updated_by and updated_at fields:
    if (user.update) {
      user.updated_by = authUserId;
    }

    await user.save({ transaction: t });
    await t.commit();

    return res.status(200).json({ message: 'Password changed successfully' });
  } catch (err) {
    await t.rollback().catch(() => { });
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
    const hashed = await bcrypt.hash(newPassword, salt);
    user.password = hashed;
    await user.save();

    return res.status(200).json({ ok: true, message: 'Password updated' });
  } catch (err) {
    console.error('adminChangePassword error', err);
    return res.status(500).json({ message: 'Server error' });
  }
};
