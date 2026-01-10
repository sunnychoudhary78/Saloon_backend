'use strict';

const SCHEMA = 'lms_api';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.addColumn(
        { tableName: 'employee_details', schema: SCHEMA },
        'work_mode',
        { type: Sequelize.STRING, allowNull: false, defaultValue: 'OFFICE' },
        { transaction: t }
      );

      await queryInterface.addColumn(
        { tableName: 'employee_details', schema: SCHEMA },
        'hybrid_office_days',
        { type: Sequelize.JSONB, allowNull: true, defaultValue: [] },
        { transaction: t }
      );
    });
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.removeColumn(
        { tableName: 'employee_details', schema: SCHEMA },
        'work_mode',
        { transaction: t }
      );
      await queryInterface.removeColumn(
        { tableName: 'employee_details', schema: SCHEMA },
        'hybrid_office_days',
        { transaction: t }
      );
    });
  }
};

