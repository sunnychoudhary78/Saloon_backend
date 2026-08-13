'use strict';

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS "${schema}".bookings_active_standard_slot_service_unique`
    );

    // Keep the oldest accepted PREMIUM row per slot; reject extra groups so the
    // unique index can be created on existing data.
    await queryInterface.sequelize.query(`
      WITH ranked AS (
        SELECT
          id,
          booking_group_id,
          ROW_NUMBER() OVER (
            PARTITION BY salon_id, booking_date, booking_time
            ORDER BY created_at ASC, id ASC
          ) AS rn
        FROM "${schema}"."bookings"
        WHERE booking_status = 'ACCEPTED' AND booking_type = 'PREMIUM'
      ),
      extras AS (
        SELECT id, booking_group_id FROM ranked WHERE rn > 1
      )
      UPDATE "${schema}"."bookings" AS b
      SET
        booking_status = 'REJECTED',
        rejection_reason = COALESCE(
          b.rejection_reason,
          'Another booking was accepted for this slot'
        ),
        updated_at = NOW()
      FROM extras e
      WHERE b.booking_status = 'ACCEPTED'
        AND (
          (e.booking_group_id IS NOT NULL AND b.booking_group_id = e.booking_group_id)
          OR (e.booking_group_id IS NULL AND b.id = e.id)
        )
    `);

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS bookings_accepted_premium_slot_unique
      ON "${schema}"."bookings" (salon_id, booking_date, booking_time)
      WHERE booking_status = 'ACCEPTED' AND booking_type = 'PREMIUM'
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS "${schema}".bookings_accepted_premium_slot_unique`
    );
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS bookings_active_standard_slot_service_unique
      ON "${schema}"."bookings" (salon_id, booking_date, booking_time, service_id)
      WHERE booking_status IN ('PENDING', 'ACCEPTED') AND booking_type = 'STANDARD'
    `);
  },
};
