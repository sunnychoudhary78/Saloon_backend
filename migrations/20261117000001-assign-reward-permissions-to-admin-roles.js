'use strict';

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';

const permissions = [
  { name: 'reward.read', display_name: 'View Rewards', description: 'View reward catalog and metrics' },
  { name: 'reward.create', display_name: 'Create Reward', description: 'Create new partner and salon rewards' },
  { name: 'reward.update', display_name: 'Update Reward', description: 'Update existing rewards' },
  { name: 'reward.delete', display_name: 'Delete Reward', description: 'Delete or deactivate rewards' },
];

const ROLE_NAMES = ['SUPER_ADMIN', 'ADMIN'];

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
           SELECT :roleId, :permId, :now, :now
           WHERE NOT EXISTS (
             SELECT 1 FROM "${schema}"."role_permissions" rp
             WHERE rp.role_id = :roleId AND rp.permission_id = :permId
           )`,
          { replacements: { roleId: role.id, permId, now } },
        );
      }
    }
  },

  async down(queryInterface) {
    const names = permissions.map((p) => p.name);
    await queryInterface.sequelize.query(
      `DELETE FROM "${schema}"."role_permissions" rp
       USING "${schema}"."roles" r, "${schema}"."permissions" p
       WHERE rp.role_id = r.id
         AND rp.permission_id = p.id
         AND r.name IN ('SUPER_ADMIN', 'ADMIN')
         AND p.name IN (:names)`,
      { replacements: { names } },
    );
  },
};
