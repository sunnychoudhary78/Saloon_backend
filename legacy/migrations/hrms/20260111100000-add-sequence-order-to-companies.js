'use strict';

const SCHEMA = process.env.DB_SCHEMA || 'template_schema';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn(
      { tableName: 'companies', schema: SCHEMA },
      'sequence_order',
      {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      }
    );
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn(
      { tableName: 'companies', schema: SCHEMA },
      'sequence_order'
    );
  }
};
