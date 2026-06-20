'use strict';

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';
const table = { schema, tableName: 'salons' };

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn(table, 'is_featured', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    await queryInterface.addColumn(table, 'featured_sort_order', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });

    await queryInterface.addIndex(table, ['is_featured', 'featured_sort_order'], {
      name: 'salons_featured_order_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(table, 'salons_featured_order_idx');
    await queryInterface.removeColumn(table, 'featured_sort_order');
    await queryInterface.removeColumn(table, 'is_featured');
  },
};
