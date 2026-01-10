'use strict';
const bcrypt = require('bcryptjs');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Check if SuperAdmin already exists (use schema-qualified table)
    const existing = await queryInterface.rawSelect(
      { schema: 'lms_api', tableName: 'users' },
      { where: { email: 'superadmin@example.com' } },
      ['id']
    );

    if (!existing) {
      // Get SuperAdmin role ID dynamically (schema-qualified)
      const [roles] = await queryInterface.sequelize.query(
        `SELECT id FROM lms_api.roles WHERE name = 'SuperAdmin' LIMIT 1;`
      );

      if (!roles || roles.length === 0) throw new Error('SuperAdmin role not found in roles table');

      const roleId = roles[0].id;

      const salt = await bcrypt.genSalt(10);
      // <-- FIX: pass the plaintext password string here (not an object)
      const hashedPassword = await bcrypt.hash('SuperAdmin123!', salt);

      await queryInterface.bulkInsert(
        { schema: 'lms_api', tableName: 'users' },
        [
          {
            name: 'Super Admin',
            email: 'superadmin@example.com',
            password: hashedPassword,
            role_id: roleId,
            created_by: null,
            updated_by: null,
            is_active: true,
            created_at: new Date(),
            updated_at: new Date()
          }
        ]
      );
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete(
      { schema: 'lms_api', tableName: 'users' },
      { email: 'superadmin@example.com' }
    );
  }
};
