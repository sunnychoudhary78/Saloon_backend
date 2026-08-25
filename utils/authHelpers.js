const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { User, Role, Permission, UserRole } = require('../models');

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SUPPORT_AGENT', 'MARKETING_MANAGER'];
const MOBILE_ROLES = ['CUSTOMER', 'SALON_OWNER'];

function generateToken(user, roles = [], expiresIn = '8h') {
  const roleNames = roles.length
    ? roles.map((r) => (typeof r === 'string' ? r : r.name))
    : (user.Roles || []).map((r) => r.name);

  return jwt.sign(
    { id: user.id, roles: roleNames },
    process.env.JWT_SECRET,
    { expiresIn }
  );
}

function generateSignupToken(phone) {
  return jwt.sign(
    { phone, purpose: 'signup' },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
}

function verifySignupToken(token) {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  if (decoded.purpose !== 'signup' || !decoded.phone) {
    throw new Error('Invalid signup token');
  }
  return decoded;
}

async function loadUserWithRoles(userId) {
  return User.findByPk(userId, {
    include: [
      {
        model: Role,
        as: 'Roles',
        through: { attributes: [] },
        include: [
          {
            model: Permission,
            as: 'permissions',
            through: { attributes: [] },
            attributes: ['id', 'name', 'displayName', 'description'],
          },
        ],
      },
    ],
  });
}

function getRoleNames(user) {
  const roles = user.Roles || (user.Role ? [user.Role] : []);
  return roles.map((r) => r.name);
}

function getUnionPermissions(user) {
  const roles = user.Roles || (user.Role ? [user.Role] : []);
  const seen = new Map();
  for (const role of roles) {
    for (const perm of role.permissions || []) {
      if (!seen.has(perm.name)) seen.set(perm.name, perm);
    }
  }
  return Array.from(seen.values());
}

function hasAnyRole(user, allowedRoles) {
  const names = getRoleNames(user);
  return allowedRoles.some((r) => names.includes(r));
}

function hasAdminAccess(user) {
  return hasAnyRole(user, ADMIN_ROLES);
}

function hasMobileAccess(user) {
  return hasAnyRole(user, MOBILE_ROLES);
}

function getMobileAccountType(roleNames, salonOwner) {
  const names = roleNames || [];
  const hasOwnerRole = names.includes('SALON_OWNER');
  if (hasOwnerRole && !salonOwner) {
    return { account_type: 'Owner pending profile', account_type_key: 'owner_pending' };
  }
  if (hasOwnerRole) {
    return { account_type: 'Salon owner', account_type_key: 'salon_owner' };
  }
  return { account_type: 'Customer', account_type_key: 'customer' };
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

function shapeUserResponse(user) {
  const roles = user.Roles || [];
  const permissions = getUnionPermissions(user);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    status: user.status,
    is_active: user.is_active,
    has_password: Boolean(user.password),
    roles: roles.map((r) => ({ id: r.id, name: r.name, hierarchy_level: r.hierarchy_level })),
    permissions,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

module.exports = {
  ADMIN_ROLES,
  MOBILE_ROLES,
  generateToken,
  generateSignupToken,
  verifySignupToken,
  loadUserWithRoles,
  getRoleNames,
  getUnionPermissions,
  hasAnyRole,
  hasAdminAccess,
  hasMobileAccess,
  getMobileAccountType,
  getEligibleMobileUserIds,
  shapeUserResponse,
};
