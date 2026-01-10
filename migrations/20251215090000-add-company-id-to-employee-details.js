'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn(
      { tableName: 'employee_details', schema: 'lms_api' },
      'company_id',
      {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: { tableName: 'companies', schema: 'lms_api' },
          key: 'id',
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      }
    );

    await queryInterface.addIndex(
      { tableName: 'employee_details', schema: 'lms_api' },
      ['company_id'],
      { name: 'idx_employee_details_company_id' }
    );
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(
      { tableName: 'employee_details', schema: 'lms_api' },
      'idx_employee_details_company_id'
    ).catch(() => {});

    await queryInterface.removeColumn(
      { tableName: 'employee_details', schema: 'lms_api' },
      'company_id'
    );
  }
};

