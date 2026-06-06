'use strict';

const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const schema = process.env.DB_SCHEMA || 'template_schema';

module.exports = {
  up: async (queryInterface) => {
    const [role] = await queryInterface.sequelize.query(
      `SELECT id FROM ${schema}.roles WHERE name IN ('SUPER_ADMIN', 'SuperAdmin') LIMIT 1`,
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );
    if (!role) throw new Error('SUPER_ADMIN role not found');

    const existingRows = await queryInterface.sequelize.query(
      `SELECT id FROM ${schema}.users WHERE email = 'superadmin@example.com' LIMIT 1`,
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );
    const existing = existingRows[0];

    let userId;
    const now = new Date();

    if (existing) {
      userId = existing.id;
      await queryInterface.sequelize.query(
        `UPDATE ${schema}.users SET status = 'ACTIVE', is_active = true, updated_at = :now WHERE id = :userId`,
        { replacements: { now, userId } }
      );
    } else {
      userId = uuidv4();
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('SuperAdmin123!', salt);
      await queryInterface.bulkInsert({ schema, tableName: 'users' }, [{
        id: userId,
        name: 'Super Admin',
        email: 'superadmin@example.com',
        phone: null,
        password: hashedPassword,
        status: 'ACTIVE',
        created_by: null,
        updated_by: null,
        is_active: true,
        created_at: now,
        updated_at: now,
      }]);
    }

    await queryInterface.sequelize.query(
      `INSERT INTO ${schema}.user_roles (user_id, role_id, assigned_at)
       VALUES (:userId, :roleId, :now)
       ON CONFLICT DO NOTHING`,
      { replacements: { userId, roleId: role.id, now } }
    );
  },

  down: async (queryInterface) => {
    await queryInterface.bulkDelete({ schema, tableName: 'users' }, { email: 'superadmin@example.com' });
  },
};
