'use strict';

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';
const salonsTable = { schema, tableName: 'salons' };
const applicationsTable = { schema, tableName: 'salon_applications' };

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn(salonsTable, 'premium_booking_fee', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
    });
    await queryInterface.addColumn(applicationsTable, 'premium_booking_fee', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn(applicationsTable, 'premium_booking_fee');
    await queryInterface.removeColumn(salonsTable, 'premium_booking_fee');
  },
};
