'use strict';

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn(
      { schema, tableName: 'bookings' },
      'reminder_sent_at',
      { type: Sequelize.DATE, allowNull: true },
    );
  },

  async down(queryInterface) {
    await queryInterface.removeColumn({ schema, tableName: 'bookings' }, 'reminder_sent_at');
  },
};
