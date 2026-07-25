'use strict';

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';
const salonsTable = { schema, tableName: 'salons' };
const applicationsTable = { schema, tableName: 'salon_applications' };

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn(salonsTable, 'salon_type', {
      type: Sequelize.ENUM('MEN', 'WOMEN', 'UNISEX'),
      allowNull: false,
      defaultValue: 'UNISEX',
    });
    await queryInterface.addColumn(applicationsTable, 'salon_type', {
      type: Sequelize.ENUM('MEN', 'WOMEN', 'UNISEX'),
      allowNull: false,
      defaultValue: 'UNISEX',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn(applicationsTable, 'salon_type');
    await queryInterface.removeColumn(salonsTable, 'salon_type');
    await queryInterface.sequelize.query(
      `DROP TYPE IF EXISTS "${schema}"."enum_salon_applications_salon_type";`
    );
    await queryInterface.sequelize.query(
      `DROP TYPE IF EXISTS "${schema}"."enum_salons_salon_type";`
    );
  },
};
