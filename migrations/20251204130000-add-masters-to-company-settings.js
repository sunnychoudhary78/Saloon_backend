'use strict';

const SCHEMA = 'lms_api';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.transaction(async (t) => {
      for (const col of ['blood_groups', 'marital_statuses', 'genders']) {
        await queryInterface.addColumn(
          { tableName: 'company_settings', schema: SCHEMA },
          col,
          { type: Sequelize.JSONB, allowNull: true, defaultValue: [] },
          { transaction: t }
        );
      }
    });
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.transaction(async (t) => {
      for (const col of ['blood_groups', 'marital_statuses', 'genders']) {
        await queryInterface.removeColumn(
          { tableName: 'company_settings', schema: SCHEMA },
          col,
          { transaction: t }
        );
      }
    });
  }
};

