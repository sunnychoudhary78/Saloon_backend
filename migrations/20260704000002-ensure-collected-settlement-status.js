'use strict';

/**
 * Idempotent follow-up: ensures COLLECTED exists even if the previous
 * migration was recorded without applying the enum value.
 */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const schema = process.env.DB_SCHEMA || 'salon_booking_schema';
    const sequelize = queryInterface.sequelize;

    try {
      await sequelize.query('COMMIT');
    } catch (_) {
      // No open transaction — fine.
    }

    await sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_enum e
          JOIN pg_type t ON e.enumtypid = t.oid
          JOIN pg_namespace n ON t.typnamespace = n.oid
          WHERE n.nspname = '${schema}'
            AND t.typname = 'enum_settlement_ledger_status'
            AND e.enumlabel = 'COLLECTED'
        ) THEN
          EXECUTE 'ALTER TYPE "${schema}"."enum_settlement_ledger_status" ADD VALUE ''COLLECTED''';
        END IF;
      END
      $$;
    `);
  },

  async down(queryInterface) {
    void queryInterface;
  },
};
