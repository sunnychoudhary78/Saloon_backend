'use strict';

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';

const permissions = [
  { name: 'payoutAccount.approve', display_name: 'Approve Payout Accounts', description: 'Approve salon payout bank accounts' },
  { name: 'payoutAccount.reject', display_name: 'Reject Payout Accounts', description: 'Reject salon payout bank accounts' },
];

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const permIds = [];
    for (const perm of permissions) {
      const [existing] = await queryInterface.sequelize.query(
        `SELECT id FROM "${schema}"."permissions" WHERE name = :name LIMIT 1`,
        { replacements: { name: perm.name } },
      );
      if (existing.length > 0) {
        permIds.push(existing[0].id);
        continue;
      }

      const id = require('crypto').randomUUID();
      await queryInterface.bulkInsert({ schema, tableName: 'permissions' }, [{
        id,
        name: perm.name,
        display_name: perm.display_name,
        description: perm.description,
        is_active: true,
        created_at: now,
        updated_at: now,
      }]);
      permIds.push(id);
    }

    const [roles] = await queryInterface.sequelize.query(
      `SELECT id, name FROM "${schema}"."roles" WHERE name IN ('SUPER_ADMIN', 'ADMIN')`,
    );
    for (const role of roles) {
      for (const permId of permIds) {
        await queryInterface.sequelize.query(
          `INSERT INTO "${schema}"."role_permissions" (role_id, permission_id, created_at, updated_at)
           VALUES (:roleId, :permId, :now, :now)
           ON CONFLICT DO NOTHING`,
          { replacements: { roleId: role.id, permId, now } },
        );
      }
    }
  },

  async down(queryInterface) {
    const names = permissions.map((p) => p.name);
    await queryInterface.bulkDelete(
      { schema, tableName: 'permissions' },
      { name: names },
    );
  },
};
