'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add company_id column to departments
    await queryInterface.addColumn(
      { schema: 'lms_api', tableName: 'departments' },
      'company_id',
      {
        type: Sequelize.UUID,
        allowNull: true,
      }
    );
    // Add FK constraint
    await queryInterface.addConstraint(
      { schema: 'lms_api', tableName: 'departments' },
      {
        type: 'foreign key',
        fields: ['company_id'],
        name: 'departments_company_id_fkey',
        references: {
          table: { schema: 'lms_api', tableName: 'companies' },
          field: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      }
    );
  },

  async down(queryInterface, Sequelize) {
    // Remove FK then column
    await queryInterface.removeConstraint(
      { schema: 'lms_api', tableName: 'departments' },
      'departments_company_id_fkey'
    );
    await queryInterface.removeColumn(
      { schema: 'lms_api', tableName: 'departments' },
      'company_id'
    );
  }
};
