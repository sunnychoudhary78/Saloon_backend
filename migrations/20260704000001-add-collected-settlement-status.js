'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const schema = process.env.DB_SCHEMA || 'salon_booking_schema';
    await queryInterface.sequelize.query(`
      ALTER TYPE "${schema}"."enum_settlement_ledger_status"
      ADD VALUE IF NOT EXISTS 'COLLECTED';
    `);
  },

  async down(queryInterface) {
    // PostgreSQL cannot remove enum values safely; leave COLLECTED in place.
    void queryInterface;
  },
};
