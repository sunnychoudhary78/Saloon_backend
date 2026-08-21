const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const {
  User,
  Role,
  UserRole,
  Customer,
  SalonOwner,
  Salon,
  sequelize,
} = require('../models');
const { getUnionPermissions, ADMIN_ROLES, MOBILE_ROLES, shapeUserResponse } = require('../utils/authHelpers');
const { userRegistryByKey } = require('../config/columnRegistry');
const { ilikeOr } = require('../utils/adminSearch');
const AppError = require('../middlewares/AppError');
const { logAudit } = require('../services/auditService');

const defaultUserColumns = [
  'name',
  'email',
  'phone',
  'account_type',
  'business_name',
  'user_status',
  'created_at',
];

function userQueryColumns() {
  return defaultUserColumns.map((k) => ({
    key: k,
    label: userRegistryByKey[k]?.label || k,
    type: userRegistryByKey[k]?.type || 'string',
  }));
}

function roleNamesOf(user) {
  return (user.Roles || []).map((r) => r.name);
}

function getMobileAccountType(roleNames, salonOwner) {
  const hasOwnerRole = roleNames.includes('SALON_OWNER');
  if (hasOwnerRole && !salonOwner) {
    return { account_type: 'Owner pending profile', account_type_key: 'owner_pending' };
  }
  if (hasOwnerRole) {
    return { account_type: 'Salon owner', account_type_key: 'salon_owner' };
  }
  return { account_type: 'Customer', account_type_key: 'customer' };
}

function assertNotStaff(roleNames) {
  if (roleNames.some((name) => ADMIN_ROLES.includes(name))) {
    throw new AppError('Staff accounts cannot be converted', 403);
  }
}

async function assignRole(userId, roleName, assignedBy = null, transaction = null) {
  const role = await Role.findOne({ where: { name: roleName }, transaction });
  if (!role) throw new AppError(`Role ${roleName} not found`, 500);
  await UserRole.findOrCreate({
    where: { user_id: userId, role_id: role.id },
    defaults: { assigned_by: assignedBy, assigned_at: new Date() },
    transaction,
  });
}

async function removeRole(userId, roleName, transaction = null) {
  const role = await Role.findOne({ where: { name: roleName }, transaction });
  if (!role) return;
  await UserRole.destroy({
    where: { user_id: userId, role_id: role.id },
    transaction,
  });
}

async function ensureCustomer(userId, adminId, transaction) {
  await assignRole(userId, 'CUSTOMER', adminId, transaction);
  const existing = await Customer.findOne({ where: { user_id: userId }, transaction });
  if (!existing) {
    await Customer.create(
      {
        user_id: userId,
        status: 'ACTIVE',
        created_by: adminId,
        updated_by: adminId,
      },
      { transaction }
    );
  }
}

async function loadConvertUser(userId, transaction = null) {
  return User.findByPk(userId, {
    include: [
      { model: Role, as: 'Roles', through: { attributes: [] } },
      { model: Customer, as: 'customer' },
      { model: SalonOwner, as: 'salon_owner' },
    ],
    attributes: { exclude: ['password'] },
    transaction,
  });
}

async function getEligibleMobileUserIds(accountType) {
  const [mobileRoles, staffRoles] = await Promise.all([
    Role.findAll({ where: { name: { [Op.in]: MOBILE_ROLES } }, attributes: ['id', 'name'] }),
    Role.findAll({ where: { name: { [Op.in]: ADMIN_ROLES } }, attributes: ['id'] }),
  ]);

  const staffUserRows = staffRoles.length
    ? await UserRole.findAll({
        where: { role_id: { [Op.in]: staffRoles.map((r) => r.id) } },
        attributes: ['user_id'],
        raw: true,
      })
    : [];
  const staffUserIds = new Set(staffUserRows.map((r) => r.user_id));

  const customerRole = mobileRoles.find((r) => r.name === 'CUSTOMER');
  const ownerRole = mobileRoles.find((r) => r.name === 'SALON_OWNER');

  let roleIds = mobileRoles.map((r) => r.id);
  if (accountType === 'customer' && customerRole) roleIds = [customerRole.id];
  if (accountType === 'salon_owner' && ownerRole) roleIds = [ownerRole.id];
  if (!roleIds.length) return [];

  const mobileUserRows = await UserRole.findAll({
    where: { role_id: { [Op.in]: roleIds } },
    attributes: ['user_id'],
    raw: true,
  });
  let ids = [...new Set(mobileUserRows.map((r) => r.user_id))].filter((id) => !staffUserIds.has(id));

  if (accountType === 'customer' && ownerRole) {
    const ownerRows = await UserRole.findAll({
      where: { role_id: ownerRole.id },
      attributes: ['user_id'],
      raw: true,
    });
    const ownerIds = new Set(ownerRows.map((r) => r.user_id));
    ids = ids.filter((id) => !ownerIds.has(id));
  }

  return ids;
}

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

exports.query = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.body.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.body.limit, 10) || 20, 1);
    const offset = (page - 1) * limit;
    const accountType = req.body.account_type;
    const columns = userQueryColumns();

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

    const where = { id: { [Op.in]: ids } };
    if (req.body.status) where.status = req.body.status;

    const searchOr = ilikeOr(['name', 'email', 'phone'], req.body.search);
    if (searchOr) Object.assign(where, searchOr);

    const { count, rows } = await User.findAndCountAll({
      where,
      include: [
        { model: Role, as: 'Roles', through: { attributes: [] } },
        { model: Customer, as: 'customer', required: false },
        { model: SalonOwner, as: 'salon_owner', required: false },
      ],
      attributes: { exclude: ['password'] },
      order: [['created_at', 'DESC']],
      limit,
      offset,
      distinct: true,
      subQuery: false,
    });

    const shaped = rows.map((r) => {
      const p = r.get({ plain: true });
      const names = (p.Roles || []).map((role) => role.name);
      const { account_type, account_type_key } = getMobileAccountType(names, p.salon_owner);
      return {
        id: p.id,
        name: p.name,
        email: p.email,
        phone: p.phone,
        account_type,
        account_type_key,
        business_name: p.salon_owner?.business_name || null,
        has_owner_profile: Boolean(p.salon_owner),
        salon_owner_status: p.salon_owner?.status || null,
        user_status: p.status,
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

exports.convertAccount = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const editorId = req.user && req.user.id;
    const { id } = req.params;
    const { target, business_name, gst_number } = req.body || {};

    const creatorPerms = getUnionPermissions(req.user).map((p) => p.name);
    if (!creatorPerms.includes('role.assign')) {
      throw new AppError('Forbidden: cannot assign roles', 403);
    }

    if (target !== 'CUSTOMER' && target !== 'SALON_OWNER') {
      throw new AppError('target must be CUSTOMER or SALON_OWNER', 400);
    }

    const user = await loadConvertUser(id, t);
    if (!user) throw new AppError('User not found', 404);

    const names = roleNamesOf(user);
    assertNotStaff(names);

    const current = getMobileAccountType(names, user.salon_owner);
    const ownerRow = user.salon_owner;

    if (target === 'CUSTOMER' && current.account_type_key === 'customer') {
      throw new AppError('User is already a customer', 400);
    }
    if (
      target === 'SALON_OWNER' &&
      current.account_type_key === 'salon_owner' &&
      ownerRow?.status === 'ACTIVE'
    ) {
      throw new AppError('User is already a salon owner', 400);
    }

    if (target === 'SALON_OWNER') {
      const trimmedName = typeof business_name === 'string' ? business_name.trim() : '';
      if (!ownerRow && !trimmedName) {
        throw new AppError('business_name is required', 400);
      }

      await ensureCustomer(user.id, editorId, t);
      await assignRole(user.id, 'SALON_OWNER', editorId, t);

      if (ownerRow) {
        ownerRow.status = 'ACTIVE';
        if (trimmedName) ownerRow.business_name = trimmedName;
        if (gst_number !== undefined) ownerRow.gst_number = gst_number || null;
        ownerRow.updated_by = editorId;
        await ownerRow.save({ transaction: t });
      } else {
        await SalonOwner.create(
          {
            user_id: user.id,
            business_name: trimmedName,
            gst_number: gst_number || null,
            status: 'ACTIVE',
            created_by: editorId,
            updated_by: editorId,
          },
          { transaction: t }
        );
      }
    } else {
      await ensureCustomer(user.id, editorId, t);
      await removeRole(user.id, 'SALON_OWNER', t);

      if (ownerRow) {
        ownerRow.status = 'BLOCKED';
        ownerRow.updated_by = editorId;
        await ownerRow.save({ transaction: t });
        await Salon.update(
          { status: 'SUSPENDED', updated_by: editorId },
          { where: { owner_id: ownerRow.id, status: 'ACTIVE' }, transaction: t }
        );
      }
    }

    await t.commit();

    const updated = await loadConvertUser(id);
    await logAudit({
      userId: editorId,
      action: 'user.convertAccount',
      entityType: 'User',
      entityId: id,
      newValues: { target },
      req,
    });

    res.json({
      message: target === 'SALON_OWNER' ? 'Converted to salon owner' : 'Converted to customer',
      user: shapeUserResponse(updated),
      customer: updated?.customer || null,
      salon_owner: updated?.salon_owner || null,
    });
  } catch (err) {
    try {
      await t.rollback();
    } catch (_) {
      /* already committed or rolled back */
    }
    next(err);
  }
};
