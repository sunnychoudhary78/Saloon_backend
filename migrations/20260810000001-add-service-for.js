'use strict';

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';
const servicesTable = { schema, tableName: 'services' };

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn(servicesTable, 'service_for', {
      type: Sequelize.ENUM('MEN', 'WOMEN', 'UNISEX'),
      allowNull: false,
      defaultValue: 'UNISEX',
    });

    // Align existing services with their salon's audience (MEN/WOMEN only).
    await queryInterface.sequelize.query(`
      UPDATE "${schema}".services AS s
      SET service_for = sal.salon_type::text::"${schema}"."enum_services_service_for"
      FROM "${schema}".salons AS sal
      WHERE s.salon_id = sal.id
        AND sal.salon_type::text IN ('MEN', 'WOMEN')
    `);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn(servicesTable, 'service_for');
    await queryInterface.sequelize.query(
      `DROP TYPE IF EXISTS "${schema}"."enum_services_service_for";`
    );
  },
};
