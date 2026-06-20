'use strict';

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS "${schema}".bookings_active_standard_slot_unique`
    );
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX bookings_active_standard_slot_service_unique
      ON "${schema}"."bookings" (salon_id, booking_date, booking_time, service_id)
      WHERE booking_status IN ('PENDING', 'ACCEPTED') AND booking_type = 'STANDARD'
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS "${schema}".bookings_active_standard_slot_service_unique`
    );
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX bookings_active_standard_slot_unique
      ON "${schema}"."bookings" (salon_id, booking_date, booking_time)
      WHERE booking_status IN ('PENDING', 'ACCEPTED') AND booking_type = 'STANDARD'
    `);
  },
};
