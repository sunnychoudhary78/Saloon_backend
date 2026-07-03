'use strict';

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const run = (sql) => queryInterface.sequelize.query(sql);

    await run(`
      CREATE INDEX IF NOT EXISTS bookings_salon_date_status_idx
      ON "${schema}"."bookings" (salon_id, booking_date, booking_status);
    `);
    await run(`
      CREATE INDEX IF NOT EXISTS bookings_salon_status_created_idx
      ON "${schema}"."bookings" (salon_id, booking_status, created_at);
    `);
    await run(`
      CREATE INDEX IF NOT EXISTS bookings_salon_customer_date_idx
      ON "${schema}"."bookings" (salon_id, customer_id, booking_date);
    `);
    await run(`
      CREATE INDEX IF NOT EXISTS salons_owner_id_idx
      ON "${schema}"."salons" (owner_id);
    `);

    const [paymentsTable] = await queryInterface.sequelize.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = :schema AND table_name = 'payments' LIMIT 1`,
      { replacements: { schema } },
    );
    if (paymentsTable.length > 0) {
      await run(`
        CREATE INDEX IF NOT EXISTS payments_salon_paid_at_idx
        ON "${schema}"."payments" (salon_id, paid_at)
        WHERE status = 'PAID';
      `);
      await run(`
        CREATE INDEX IF NOT EXISTS payments_salon_method_status_idx
        ON "${schema}"."payments" (salon_id, method, status);
      `);
    }

    const [ledgerTable] = await queryInterface.sequelize.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = :schema AND table_name = 'settlement_ledger' LIMIT 1`,
      { replacements: { schema } },
    );
    if (ledgerTable.length > 0) {
      await run(`
        CREATE INDEX IF NOT EXISTS settlement_ledger_salon_status_type_idx
        ON "${schema}"."settlement_ledger" (salon_id, status, entry_type);
      `);
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS "${schema}".bookings_salon_date_status_idx;`);
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS "${schema}".bookings_salon_status_created_idx;`);
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS "${schema}".bookings_salon_customer_date_idx;`);
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS "${schema}".payments_salon_paid_at_idx;`);
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS "${schema}".payments_salon_method_status_idx;`);
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS "${schema}".settlement_ledger_salon_status_type_idx;`);
    await queryInterface.sequelize.query(`DROP INDEX IF EXISTS "${schema}".salons_owner_id_idx;`);
  },
};
