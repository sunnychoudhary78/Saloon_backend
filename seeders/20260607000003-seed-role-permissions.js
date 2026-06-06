'use strict';

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';

const ROLE_PERMISSIONS = {
  SUPER_ADMIN: '*',
  ADMIN: '*',
  SUPPORT_AGENT: [
    'stats.read',
    'salonOwner.read', 'salonOwner.update', 'salonOwner.block',
    'salonApplication.read', 'salonApplication.approve', 'salonApplication.reject',
    'salon.read', 'salon.update', 'salon.suspend',
    'serviceCategory.read', 'service.read',
    'customer.read', 'customer.update', 'customer.block',
    'booking.read', 'booking.update',
    'review.read', 'review.moderate', 'review.hide',
    'auditLog.read',
  ],
  MARKETING_MANAGER: [
    'stats.read',
    'coupon.read', 'coupon.create', 'coupon.update', 'coupon.makeInactive',
    'banner.read', 'banner.create', 'banner.update', 'banner.makeInactive',
    'review.read', 'review.moderate', 'review.hide',
    'salon.read', 'serviceCategory.read',
  ],
};

module.exports = {
  up: async (queryInterface) => {
    const roles = await queryInterface.sequelize.query(
      `SELECT id, name FROM ${schema}.roles`,
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );
    const perms = await queryInterface.sequelize.query(
      `SELECT id, name FROM ${schema}.permissions WHERE is_active = true`,
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );

    const roleMap = Object.fromEntries(roles.map((r) => [r.name, r.id]));
    const permMap = Object.fromEntries(perms.map((p) => [p.name, p.id]));
    const allPermIds = perms.map((p) => p.id);

    for (const [roleName, permNames] of Object.entries(ROLE_PERMISSIONS)) {
      const roleId = roleMap[roleName];
      if (!roleId) continue;

      const targetPermIds = permNames === '*'
        ? allPermIds
        : permNames.map((n) => permMap[n]).filter(Boolean);

      for (const permId of targetPermIds) {
        await queryInterface.sequelize.query(
          `INSERT INTO ${schema}.role_permissions (role_id, permission_id, created_at, updated_at)
           VALUES (:roleId, :permId, NOW(), NOW())
           ON CONFLICT DO NOTHING`,
          { replacements: { roleId, permId } }
        );
      }
    }
  },

  down: async (queryInterface) => {
    await queryInterface.bulkDelete({ schema, tableName: 'role_permissions' }, null, {});
  },
};
