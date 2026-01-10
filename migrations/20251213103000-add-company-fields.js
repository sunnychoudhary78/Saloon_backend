'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const table = { tableName: 'companies', schema: 'lms_api' };
    await queryInterface.addColumn(table, 'description', { type: Sequelize.TEXT, allowNull: true });
    await queryInterface.addColumn(table, 'logo_filename', { type: Sequelize.STRING, allowNull: true });
    await queryInterface.addColumn(table, 'address', { type: Sequelize.TEXT, allowNull: true });
  },

  down: async (queryInterface) => {
    const table = { tableName: 'companies', schema: 'lms_api' };
    await queryInterface.removeColumn(table, 'address').catch(() => {});
    await queryInterface.removeColumn(table, 'logo_filename').catch(() => {});
    await queryInterface.removeColumn(table, 'description').catch(() => {});
  }
};

