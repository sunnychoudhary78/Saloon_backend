'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Drop old unique constraint on name
    try {
      await queryInterface.removeConstraint(
        { schema: 'lms_api', tableName: 'departments' },
        'departments_name_key'
      );
    } catch (e) {
      // ignore if not present
    }
    // Add composite unique on (company_id, name)
    await queryInterface.addConstraint(
      { schema: 'lms_api', tableName: 'departments' },
      {
        type: 'unique',
        fields: ['company_id', 'name'],
        name: 'departments_company_id_name_key',
      }
    );
  },

  async down(queryInterface, Sequelize) {
    // Remove composite unique
    await queryInterface.removeConstraint(
      { schema: 'lms_api', tableName: 'departments' },
      'departments_company_id_name_key'
    );
    // Restore unique on name
    await queryInterface.addConstraint(
      { schema: 'lms_api', tableName: 'departments' },
      {
        type: 'unique',
        fields: ['name'],
        name: 'departments_name_key',
      }
    );
  }
};
