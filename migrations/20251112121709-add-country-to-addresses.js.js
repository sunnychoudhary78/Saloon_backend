'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add "country" column to addresses table in schema "lms_api"
    await queryInterface.addColumn(
      { schema: 'lms_api', tableName: 'addresses' },
      'country',
      {
        type: Sequelize.STRING,
        allowNull: true,
        defaultValue: 'India',
      }
    );
  },

  down: async (queryInterface, Sequelize) => {
    // Remove the "country" column if rolled back
    await queryInterface.removeColumn(
      { schema: 'lms_api', tableName: 'addresses' },
      'country'
    );
  },
};
