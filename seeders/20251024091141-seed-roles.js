'use strict';
const { v4: uuidv4 } = require('uuid');
const schema = process.env.DB_SCHEMA || 'template_schema';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const roles = [
      {
        id: uuidv4(),
        name: 'SuperAdmin',
        created_by: null,
        updated_by: null,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      }
    ];

    await queryInterface.bulkInsert({ schema, tableName: 'roles' }, roles);

    // Log the SuperAdmin ID for reference
    console.log('Seeded SuperAdmin role with ID:', roles[0].id);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete({ schema, tableName: 'roles' }, null, {});

  }
};
