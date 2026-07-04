'use strict';

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';
const salonsTable = { schema, tableName: 'salons' };
const applicationsTable = { schema, tableName: 'salon_applications' };

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn(salonsTable, 'formatted_address', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn(salonsTable, 'locality', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn(salonsTable, 'postal_code', {
      type: Sequelize.STRING(16),
      allowNull: true,
    });

    await queryInterface.addColumn(applicationsTable, 'formatted_address', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn(applicationsTable, 'locality', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn(applicationsTable, 'postal_code', {
      type: Sequelize.STRING(16),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn(applicationsTable, 'postal_code');
    await queryInterface.removeColumn(applicationsTable, 'locality');
    await queryInterface.removeColumn(applicationsTable, 'formatted_address');
    await queryInterface.removeColumn(salonsTable, 'postal_code');
    await queryInterface.removeColumn(salonsTable, 'locality');
    await queryInterface.removeColumn(salonsTable, 'formatted_address');
  },
};
