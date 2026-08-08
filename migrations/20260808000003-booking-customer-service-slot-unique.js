'use strict';

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS bookings_active_customer_service_slot_unique
      ON "${schema}"."bookings" (customer_id, service_id, booking_date, booking_time)
      WHERE booking_status IN ('PENDING', 'ACCEPTED');
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS "${schema}"."bookings_active_customer_service_slot_unique";
    `);
  },
};
