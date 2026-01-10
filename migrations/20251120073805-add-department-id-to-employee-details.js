'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // add department_id column to employee_details in lms_api schema
    await queryInterface.addColumn(
      { tableName: 'employee_details', schema: 'lms_api' },
      'department_id',
      {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          // reference departments table in same schema
          model: { tableName: 'departments', schema: 'lms_api' },
          key: 'id',
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      }
    );

    // (Optional) create an index for faster lookups by department_id
    await queryInterface.addIndex(
      { tableName: 'employee_details', schema: 'lms_api' },
      ['department_id'],
      {
        name: 'idx_employee_details_department_id',
      }
    );
  },

  async down(queryInterface) {
    // remove index then drop column
    await queryInterface.removeIndex(
      { tableName: 'employee_details', schema: 'lms_api' },
      'idx_employee_details_department_id'
    ).catch(() => { /* ignore if not exists */ });

    await queryInterface.removeColumn(
      { tableName: 'employee_details', schema: 'lms_api' },
      'department_id'
    );
  }
};
