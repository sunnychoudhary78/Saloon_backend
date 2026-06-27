'use strict';

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS payments_razorpay_order_id_unique
      ON "${schema}"."payments" (razorpay_order_id)
      WHERE razorpay_order_id IS NOT NULL
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS "${schema}"."payments_razorpay_order_id_unique"
    `);
  },
};
