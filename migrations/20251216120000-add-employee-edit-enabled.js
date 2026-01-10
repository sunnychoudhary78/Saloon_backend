'use strict';

const SCHEMA = 'lms_api';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn(
      { tableName: 'employee_details', schema: SCHEMA },
      'employee_edit_enabled',
      {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'If false, employee cannot edit their details until manager enables',
      }
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn(
      { tableName: 'employee_details', schema: SCHEMA },
      'employee_edit_enabled'
    );
  }
};
