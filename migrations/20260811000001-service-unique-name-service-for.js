'use strict';

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';

const quote = (value) => `"${String(value).replace(/"/g, '""')}"`;
const qualified = (name) => `${quote(schema)}.${quote(name)}`;

const OLD_INDEX = 'services_salon_normalized_identity_uq';
const NEW_INDEX = 'services_salon_name_service_for_uq';

const NORMALIZED_NAME = `LOWER(REGEXP_REPLACE(BTRIM(service_name), '\\s+', ' ', 'g'))`;

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const [duplicates] = await queryInterface.sequelize.query(
        `SELECT
           salon_id,
           ${NORMALIZED_NAME} AS normalized_name,
           service_for,
           COUNT(*)::int AS duplicate_count
         FROM ${qualified('services')}
         GROUP BY salon_id, ${NORMALIZED_NAME}, service_for
         HAVING COUNT(*) > 1
         ORDER BY salon_id, normalized_name, service_for`,
        { transaction }
      );

      if (duplicates.length > 0) {
        const details = duplicates
          .map(
            (row) =>
              `${row.salon_id} / ${row.normalized_name} / ${row.service_for} (${row.duplicate_count})`
          )
          .join('; ');
        throw new Error(
          `Cannot create unique index ${NEW_INDEX}: existing name+gender duplicates: ${details}`
        );
      }

      await queryInterface.sequelize.query(
        `DROP INDEX IF EXISTS ${qualified(OLD_INDEX)};`,
        { transaction }
      );

      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX ${NEW_INDEX}
         ON ${qualified('services')} (
           salon_id,
           ${NORMALIZED_NAME},
           service_for
         );`,
        { transaction }
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `DROP INDEX IF EXISTS ${qualified(NEW_INDEX)};`,
        { transaction }
      );

      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX ${OLD_INDEX}
         ON ${qualified('services')} (
           salon_id,
           ${NORMALIZED_NAME},
           COALESCE(LOWER(REGEXP_REPLACE(BTRIM(description), '\\s+', ' ', 'g')), ''),
           price
         );`,
        { transaction }
      );
    });
  },
};
