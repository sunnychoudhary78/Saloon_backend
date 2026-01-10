'use strict';
const { v4: uuidv4 } = require('uuid');

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

    await queryInterface.bulkInsert({ schema: 'lms_api', tableName: 'roles' }, roles);

    // Log the SuperAdmin ID for reference
    console.log('Seeded SuperAdmin role with ID:', roles[0].id);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete({ schema: 'lms_api', tableName: 'roles' }, null, {});

  }
};
