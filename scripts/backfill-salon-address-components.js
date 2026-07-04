require('dotenv').config();

const { sequelize } = require('../models');
const { reverseGeocodeCoordinates } = require('../services/geocodingService');

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function backfillTable(tableName) {
  const rows = await sequelize.query(
    `SELECT id, salon_name, address, city, state, latitude, longitude,
            formatted_address, locality, postal_code
     FROM ${schema}.${tableName}
     WHERE latitude IS NOT NULL
       AND longitude IS NOT NULL
       AND (
         formatted_address IS NULL
         OR formatted_address = ''
         OR locality IS NULL
         OR postal_code IS NULL
       )`,
    { type: sequelize.QueryTypes.SELECT },
  );

  console.log(`[${tableName}] Found ${rows.length} row(s) needing address components`);

  let updated = 0;
  let failed = 0;

  for (const row of rows) {
    const mapped = await reverseGeocodeCoordinates(row.latitude, row.longitude);
    if (!mapped) {
      console.log(`FAILED: ${row.salon_name || row.id} (${row.id})`);
      failed += 1;
      await delay(1100);
      continue;
    }

    await sequelize.query(
      `UPDATE ${schema}.${tableName}
       SET formatted_address = COALESCE(NULLIF(formatted_address, ''), :formatted_address),
           locality = COALESCE(locality, :locality),
           postal_code = COALESCE(postal_code, :postal_code),
           updated_at = NOW()
       WHERE id = :id`,
      {
        replacements: {
          id: row.id,
          formatted_address: mapped.formatted_address || null,
          locality: mapped.locality || null,
          postal_code: mapped.postal_code || null,
        },
      },
    );

    console.log(`OK: ${row.salon_name || row.id} -> ${mapped.formatted_address}`);
    updated += 1;
    await delay(1100);
  }

  return { updated, failed };
}

(async () => {
  const salonResult = await backfillTable('salons');
  const appResult = await backfillTable('salon_applications');

  console.log(
    `Done. salons updated=${salonResult.updated} failed=${salonResult.failed}; `
    + `applications updated=${appResult.updated} failed=${appResult.failed}`,
  );

  await sequelize.close();
  const failed = salonResult.failed + appResult.failed;
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
