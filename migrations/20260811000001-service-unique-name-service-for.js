'use strict';

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';

const quote = (value) => `"${String(value).replace(/"/g, '""')}"`;
const qualified = (name) => `${quote(schema)}.${quote(name)}`;

const OLD_INDEX = 'services_salon_normalized_identity_uq';
const NEW_INDEX = 'services_salon_name_service_for_uq';

const NORMALIZED_NAME = `LOWER(REGEXP_REPLACE(BTRIM(service_name), '\\s+', ' ', 'g'))`;

function displayName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ') || 'Service';
}

function normalizeName(value) {
  return displayName(value).toLowerCase();
}

async function nameTaken(queryInterface, transaction, { salonId, serviceFor, normalizedName, excludeId }) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT id
     FROM ${qualified('services')}
     WHERE salon_id = :salonId
       AND service_for = :serviceFor
       AND id <> :excludeId
       AND ${NORMALIZED_NAME} = :normalizedName
     LIMIT 1`,
    {
      transaction,
      replacements: {
        salonId,
        serviceFor,
        excludeId,
        normalizedName,
      },
    }
  );
  return rows.length > 0;
}

async function renameDuplicateServices(queryInterface, transaction) {
  const [groups] = await queryInterface.sequelize.query(
    `SELECT
       salon_id,
       ${NORMALIZED_NAME} AS normalized_name,
       service_for
     FROM ${qualified('services')}
     GROUP BY salon_id, ${NORMALIZED_NAME}, service_for
     HAVING COUNT(*) > 1
     ORDER BY salon_id, normalized_name, service_for`,
    { transaction }
  );

  for (const group of groups) {
    const [rows] = await queryInterface.sequelize.query(
      `SELECT id, service_name
       FROM ${qualified('services')}
       WHERE salon_id = :salonId
         AND service_for = :serviceFor
         AND ${NORMALIZED_NAME} = :normalizedName
       ORDER BY created_at ASC, id ASC`,
      {
        transaction,
        replacements: {
          salonId: group.salon_id,
          serviceFor: group.service_for,
          normalizedName: group.normalized_name,
        },
      }
    );

    if (rows.length < 2) continue;

    const keeperName = displayName(rows[0].service_name);
    let suffix = 2;

    for (const extra of rows.slice(1)) {
      let nextName = `${keeperName} (${suffix})`;
      while (
        await nameTaken(queryInterface, transaction, {
          salonId: group.salon_id,
          serviceFor: group.service_for,
          normalizedName: normalizeName(nextName),
          excludeId: extra.id,
        })
      ) {
        suffix += 1;
        nextName = `${keeperName} (${suffix})`;
      }

      await queryInterface.sequelize.query(
        `UPDATE ${qualified('services')}
         SET service_name = :nextName
         WHERE id = :id`,
        {
          transaction,
          replacements: { nextName, id: extra.id },
        }
      );
      suffix += 1;
    }
  }
}

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await renameDuplicateServices(queryInterface, transaction);

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
