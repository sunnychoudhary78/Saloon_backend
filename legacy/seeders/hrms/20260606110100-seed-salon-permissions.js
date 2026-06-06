'use strict';

const { v4: uuidv4 } = require('uuid');
const schema = process.env.DB_SCHEMA || 'template_schema';

module.exports = {
  up: async (queryInterface) => {
    const now = new Date();

    const permissions = [
      { name: 'stats.read', display_name: 'Read Statistics', description: 'View dashboard statistics' },
      { name: 'salonOwner.read', display_name: 'Read Salon Owners', description: 'View salon owners' },
      { name: 'salonOwner.create', display_name: 'Create Salon Owner', description: 'Create salon owner' },
      { name: 'salonOwner.update', display_name: 'Update Salon Owner', description: 'Update salon owner' },
      { name: 'salonOwner.block', display_name: 'Block Salon Owner', description: 'Block salon owner' },
      { name: 'salonApplication.read', display_name: 'Read Applications', description: 'View salon applications' },
      { name: 'salonApplication.approve', display_name: 'Approve Application', description: 'Approve salon application' },
      { name: 'salonApplication.reject', display_name: 'Reject Application', description: 'Reject salon application' },
      { name: 'salon.read', display_name: 'Read Salons', description: 'View salons' },
      { name: 'salon.create', display_name: 'Create Salon', description: 'Create salon' },
      { name: 'salon.update', display_name: 'Update Salon', description: 'Update salon' },
      { name: 'salon.suspend', display_name: 'Suspend Salon', description: 'Suspend salon' },
      { name: 'salon.close', display_name: 'Close Salon', description: 'Close salon' },
      { name: 'serviceCategory.read', display_name: 'Read Categories', description: 'View service categories' },
      { name: 'serviceCategory.create', display_name: 'Create Category', description: 'Create service category' },
      { name: 'serviceCategory.update', display_name: 'Update Category', description: 'Update service category' },
      { name: 'serviceCategory.makeInactive', display_name: 'Deactivate Category', description: 'Deactivate category' },
      { name: 'service.read', display_name: 'Read Services', description: 'View services' },
      { name: 'service.create', display_name: 'Create Service', description: 'Create service' },
      { name: 'service.update', display_name: 'Update Service', description: 'Update service' },
      { name: 'service.makeInactive', display_name: 'Deactivate Service', description: 'Deactivate service' },
      { name: 'customer.read', display_name: 'Read Customers', description: 'View customers' },
      { name: 'customer.update', display_name: 'Update Customer', description: 'Update customer' },
      { name: 'customer.block', display_name: 'Block Customer', description: 'Block customer' },
      { name: 'booking.read', display_name: 'Read Bookings', description: 'View bookings' },
      { name: 'booking.update', display_name: 'Update Booking', description: 'Update booking status' },
      { name: 'review.read', display_name: 'Read Reviews', description: 'View reviews' },
      { name: 'review.moderate', display_name: 'Moderate Reviews', description: 'Publish reviews' },
      { name: 'review.hide', display_name: 'Hide Reviews', description: 'Hide reviews' },
      { name: 'coupon.read', display_name: 'Read Coupons', description: 'View coupons' },
      { name: 'coupon.create', display_name: 'Create Coupon', description: 'Create coupon' },
      { name: 'coupon.update', display_name: 'Update Coupon', description: 'Update coupon' },
      { name: 'coupon.makeInactive', display_name: 'Deactivate Coupon', description: 'Deactivate coupon' },
      { name: 'banner.read', display_name: 'Read Banners', description: 'View banners' },
      { name: 'banner.create', display_name: 'Create Banner', description: 'Create banner' },
      { name: 'banner.update', display_name: 'Update Banner', description: 'Update banner' },
      { name: 'banner.makeInactive', display_name: 'Deactivate Banner', description: 'Deactivate banner' },
      { name: 'platformSetting.read', display_name: 'Read Settings', description: 'View platform settings' },
      { name: 'platformSetting.update', display_name: 'Update Settings', description: 'Update platform settings' },
      { name: 'auditLog.read', display_name: 'Read Audit Logs', description: 'View audit logs' },
      { name: 'role.read', display_name: 'Read Roles', description: 'View roles' },
      { name: 'role.create', display_name: 'Create Role', description: 'Create role' },
      { name: 'role.update', display_name: 'Update Role', description: 'Update role' },
      { name: 'role.assign', display_name: 'Assign Role', description: 'Assign roles to users' },
      { name: 'role.makeInactive', display_name: 'Deactivate Role', description: 'Deactivate role' },
      { name: 'permission.read', display_name: 'Read Permissions', description: 'View permissions' },
      { name: 'permission.create', display_name: 'Create Permission', description: 'Create permission' },
      { name: 'permission.update', display_name: 'Update Permission', description: 'Update permission' },
      { name: 'permission.assign', display_name: 'Assign Permission', description: 'Assign permissions' },
      { name: 'permission.makeInactive', display_name: 'Deactivate Permission', description: 'Deactivate permission' },
      { name: 'user.read', display_name: 'Read Users', description: 'View users' },
      { name: 'user.create', display_name: 'Create User', description: 'Create user' },
      { name: 'user.update', display_name: 'Update User', description: 'Update user' },
      { name: 'user.makeInactive', display_name: 'Deactivate User', description: 'Deactivate user' },
    ];

    const existing = await queryInterface.sequelize.query(
      `SELECT name FROM ${schema}.permissions`,
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );
    const existingNames = new Set(existing.map((p) => p.name));

    const toInsert = permissions
      .filter((p) => !existingNames.has(p.name))
      .map((p) => ({
        id: uuidv4(),
        name: p.name,
        display_name: p.display_name,
        description: p.description,
        created_by: null,
        updated_by: null,
        is_active: true,
        created_at: now,
        updated_at: now,
      }));

    if (toInsert.length) {
      await queryInterface.bulkInsert({ schema, tableName: 'permissions' }, toInsert);
    }
  },

  down: async () => {},
};
