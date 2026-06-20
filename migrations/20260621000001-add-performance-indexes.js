'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.addIndex('reviews', ['salon_id', 'status'], {
      name: 'reviews_salon_id_status_idx',
    });
    await queryInterface.addIndex('salons', ['status', 'is_active'], {
      name: 'salons_status_is_active_idx',
    });
    await queryInterface.addIndex('services', ['salon_id', 'status'], {
      name: 'services_salon_id_status_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('reviews', 'reviews_salon_id_status_idx');
    await queryInterface.removeIndex('salons', 'salons_status_is_active_idx');
    await queryInterface.removeIndex('services', 'services_salon_id_status_idx');
  },
};
