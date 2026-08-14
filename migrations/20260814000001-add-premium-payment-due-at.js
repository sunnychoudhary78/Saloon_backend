'use strict';

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn(
      { schema, tableName: 'bookings' },
      'premium_payment_due_at',
      { type: Sequelize.DATE, allowNull: true },
    );

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS bookings_premium_payment_due_at_idx
      ON "${schema}"."bookings" (premium_payment_due_at)
      WHERE booking_status = 'ACCEPTED'
        AND booking_type = 'PREMIUM'
        AND premium_payment_due_at IS NOT NULL
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS "${schema}".bookings_premium_payment_due_at_idx`,
    );
    await queryInterface.removeColumn(
      { schema, tableName: 'bookings' },
      'premium_payment_due_at',
    );
  },
};
