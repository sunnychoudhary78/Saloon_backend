'use strict';

const { v4: uuidv4 } = require('uuid');
const schema = process.env.DB_SCHEMA || 'salon_booking_schema';

const ROLES = [
  { name: 'SUPER_ADMIN', hierarchy_level: 0 },
  { name: 'ADMIN', hierarchy_level: 100 },
  { name: 'SUPPORT_AGENT', hierarchy_level: 200 },
  { name: 'MARKETING_MANAGER', hierarchy_level: 300 },
  { name: 'SALON_OWNER', hierarchy_level: 400 },
  { name: 'CUSTOMER', hierarchy_level: 500 },
];

module.exports = {
  up: async (queryInterface) => {
    const now = new Date();

    for (const role of ROLES) {
      const [existing] = await queryInterface.sequelize.query(
        `SELECT id FROM ${schema}.roles WHERE name = :name LIMIT 1`,
        { replacements: { name: role.name }, type: queryInterface.sequelize.QueryTypes.SELECT }
      );

      if (!existing) {
        await queryInterface.bulkInsert({ schema, tableName: 'roles' }, [{
          id: uuidv4(),
          name: role.name,
          hierarchy_level: role.hierarchy_level,
          created_by: null,
          updated_by: null,
          is_active: true,
          created_at: now,
          updated_at: now,
        }]);
      }
    }
  },

  down: async (queryInterface) => {
    const names = ROLES.map((r) => r.name);
    await queryInterface.bulkDelete({ schema, tableName: 'roles' }, { name: names });
  },
};
