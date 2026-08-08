'use strict';

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn(
      { schema, tableName: 'reviews' },
      'staff_rating',
      {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
    );

    await queryInterface.sequelize.query(`
      UPDATE "${schema}"."reviews" AS r
      SET staff_rating = r.rating
      FROM "${schema}"."bookings" AS b
      WHERE r.booking_id = b.id
        AND b.staff_id IS NOT NULL
        AND r.staff_rating IS NULL
    `);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn(
      { schema, tableName: 'reviews' },
      'staff_rating',
    );
  },
};
