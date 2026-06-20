'use strict';

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';

module.exports = {
  async up(queryInterface) {
    const enumName = `"${schema}"."enum_salon_applications_application_type"`;

    await queryInterface.sequelize.query(
      `ALTER TYPE ${enumName} ADD VALUE IF NOT EXISTS 'DEACTIVATE';`
    );
    await queryInterface.sequelize.query(
      `ALTER TYPE ${enumName} ADD VALUE IF NOT EXISTS 'ACTIVATE';`
    );

    await queryInterface.sequelize.query(
      `UPDATE "${schema}"."salon_applications"
       SET application_type = 'DEACTIVATE'
       WHERE application_type = 'CLOSE';`
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `UPDATE "${schema}"."salon_applications"
       SET application_type = 'CLOSE'
       WHERE application_type = 'DEACTIVATE';`
    );
    // PostgreSQL does not support removing enum values; ACTIVATE/DEACTIVATE remain.
  },
};
