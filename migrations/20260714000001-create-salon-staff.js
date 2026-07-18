'use strict';

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';

const baseAudit = (Sequelize) => ({
  created_by: { type: Sequelize.UUID, allowNull: true },
  updated_by: { type: Sequelize.UUID, allowNull: true },
  is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
  created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
  updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
});

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable({ schema, tableName: 'salon_staff' }, {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      salon_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: { tableName: 'salons', schema }, key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      name: { type: Sequelize.STRING, allowNull: false },
      profile_image: { type: Sequelize.STRING, allowNull: true },
      status: {
        type: Sequelize.ENUM('ACTIVE', 'INACTIVE'),
        allowNull: false,
        defaultValue: 'ACTIVE',
      },
      sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      ...baseAudit(Sequelize),
    });

    await queryInterface.addIndex(
      { schema, tableName: 'salon_staff' },
      ['salon_id', 'status'],
      { name: 'salon_staff_salon_id_status_idx' }
    );

    await queryInterface.addColumn({ schema, tableName: 'bookings' }, 'staff_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: { tableName: 'salon_staff', schema }, key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    await queryInterface.addIndex(
      { schema, tableName: 'bookings' },
      ['staff_id'],
      { name: 'bookings_staff_id_idx' }
    );
  },

  async down(queryInterface) {
    await queryInterface.removeIndex({ schema, tableName: 'bookings' }, 'bookings_staff_id_idx');
    await queryInterface.removeColumn({ schema, tableName: 'bookings' }, 'staff_id');
    await queryInterface.removeIndex(
      { schema, tableName: 'salon_staff' },
      'salon_staff_salon_id_status_idx'
    );
    await queryInterface.dropTable({ schema, tableName: 'salon_staff' });

    // Drop ENUM type created for salon_staff.status (Postgres).
    await queryInterface.sequelize.query(
      `DROP TYPE IF EXISTS "${schema}"."enum_salon_staff_status";`
    );
  },
};
