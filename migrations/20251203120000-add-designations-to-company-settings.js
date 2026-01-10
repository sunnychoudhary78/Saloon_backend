'use strict';

const SCHEMA = 'lms_api';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.addColumn(
        { tableName: 'company_settings', schema: SCHEMA },
        'designations',
        { type: Sequelize.JSONB, allowNull: true, defaultValue: [] },
        { transaction: t }
      );
    });
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.removeColumn(
        { tableName: 'company_settings', schema: SCHEMA },
        'designations',
        { transaction: t }
      );
    });
  }
};

