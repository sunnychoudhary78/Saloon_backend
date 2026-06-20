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
    await queryInterface.sequelize.query(
      `CREATE TYPE "${schema}"."enum_bookings_booking_type" AS ENUM ('STANDARD', 'PREMIUM')`
    );
    await queryInterface.sequelize.query(
      `CREATE TYPE "${schema}"."enum_bookings_premium_payment_status" AS ENUM ('NONE', 'PENDING', 'PAID', 'FAILED')`
    );

    await queryInterface.sequelize.query(`
      ALTER TABLE "${schema}"."bookings"
      ADD COLUMN booking_type "${schema}"."enum_bookings_booking_type" NOT NULL DEFAULT 'STANDARD'
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE "${schema}"."bookings"
      ADD COLUMN premium_amount DECIMAL(10, 2)
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE "${schema}"."bookings"
      ADD COLUMN premium_payment_status "${schema}"."enum_bookings_premium_payment_status" NOT NULL DEFAULT 'NONE'
    `);

    await queryInterface.createTable({ schema, tableName: 'salon_slot_overrides' }, {
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
      slot_date: { type: Sequelize.DATEONLY, allowNull: false },
      slot_start: { type: Sequelize.TIME, allowNull: false },
      is_blocked: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      note: { type: Sequelize.TEXT, allowNull: true },
      ...baseAudit(Sequelize),
    });

    await queryInterface.addIndex(
      { schema, tableName: 'salon_slot_overrides' },
      ['salon_id', 'slot_date', 'slot_start'],
      { unique: true, name: 'salon_slot_overrides_unique_slot' }
    );

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX bookings_active_standard_slot_unique
      ON "${schema}"."bookings" (salon_id, booking_date, booking_time)
      WHERE booking_status IN ('PENDING', 'ACCEPTED') AND booking_type = 'STANDARD'
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS "${schema}".bookings_active_standard_slot_unique`
    );
    await queryInterface.dropTable({ schema, tableName: 'salon_slot_overrides' });
    await queryInterface.removeColumn({ schema, tableName: 'bookings' }, 'premium_payment_status');
    await queryInterface.removeColumn({ schema, tableName: 'bookings' }, 'premium_amount');
    await queryInterface.removeColumn({ schema, tableName: 'bookings' }, 'booking_type');
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${schema}"."enum_bookings_premium_payment_status"`);
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${schema}"."enum_bookings_booking_type"`);
  },
};
