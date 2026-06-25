'use strict';

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn(
      { schema, tableName: 'bookings' },
      'booking_group_id',
      { type: Sequelize.UUID, allowNull: true },
    );
    await queryInterface.addIndex(
      { schema, tableName: 'bookings' },
      ['booking_group_id'],
      { name: 'bookings_booking_group_id_idx' },
    );
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(
      { schema, tableName: 'bookings' },
      'bookings_booking_group_id_idx',
    );
    await queryInterface.removeColumn(
      { schema, tableName: 'bookings' },
      'booking_group_id',
    );
  },
};
