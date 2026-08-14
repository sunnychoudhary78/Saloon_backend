'use strict';

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.addIndex({ schema, tableName: 'reviews' }, ['salon_id', 'status'], {
      name: 'reviews_salon_id_status_idx',
    });
    await queryInterface.addIndex({ schema, tableName: 'salons' }, ['status', 'is_active'], {
      name: 'salons_status_is_active_idx',
    });
    await queryInterface.addIndex({ schema, tableName: 'services' }, ['salon_id', 'status'], {
      name: 'services_salon_id_status_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex({ schema, tableName: 'reviews' }, 'reviews_salon_id_status_idx');
    await queryInterface.removeIndex({ schema, tableName: 'salons' }, 'salons_status_is_active_idx');
    await queryInterface.removeIndex({ schema, tableName: 'services' }, 'services_salon_id_status_idx');
  },
};
