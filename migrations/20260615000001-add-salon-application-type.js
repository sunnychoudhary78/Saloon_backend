'use strict';

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn(
      { schema, tableName: 'salon_applications' },
      'application_type',
      {
        type: Sequelize.ENUM('CREATE', 'UPDATE', 'CLOSE'),
        allowNull: false,
        defaultValue: 'CREATE',
      }
    );

    await queryInterface.addColumn(
      { schema, tableName: 'salon_applications' },
      'salon_id',
      {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: { tableName: 'salons', schema }, key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      }
    );
  },

  async down(queryInterface) {
    await queryInterface.removeColumn({ schema, tableName: 'salon_applications' }, 'salon_id');
    await queryInterface.removeColumn({ schema, tableName: 'salon_applications' }, 'application_type');
    await queryInterface.sequelize.query(
      `DROP TYPE IF EXISTS "${schema}"."enum_salon_applications_application_type";`
    );
  },
};
