const jwt = require('jsonwebtoken');
const { User, Role, Permission } = require('../models');

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'SUPPORT_AGENT', 'MARKETING_MANAGER'];
const MOBILE_ROLES = ['CUSTOMER', 'SALON_OWNER'];

function generateToken(user, roles = []) {
  const roleNames = roles.length
    ? roles.map((r) => (typeof r === 'string' ? r : r.name))
    : (user.Roles || []).map((r) => r.name);

  return jwt.sign(
    { id: user.id, roles: roleNames },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
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
  loadUserWithRoles,
  getRoleNames,
  getUnionPermissions,
  hasAnyRole,
  hasAdminAccess,
  hasMobileAccess,
  shapeUserResponse,
};
