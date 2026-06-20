require('dotenv').config();

const { sequelize } = require('../models');
const { geocodeSalonAddress } = require('../services/geocodingService');

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  const salons = await sequelize.query(
    `SELECT id, salon_name, address, city, state, latitude, longitude
     FROM ${schema}.salons
     WHERE latitude IS NULL OR longitude IS NULL`,
    { type: sequelize.QueryTypes.SELECT },
  );

  console.log(`Found ${salons.length} salon(s) without coordinates`);

  let updated = 0;
  let failed = 0;

  for (const salon of salons) {
    const coords = await geocodeSalonAddress({
      address: salon.address,
      city: salon.city,
      state: salon.state,
    });

    if (!coords) {
      console.log(`FAILED: ${salon.salon_name} (${salon.id})`);
      failed += 1;
      await delay(1100);
      continue;
    }

    await sequelize.query(
      `UPDATE ${schema}.salons
       SET latitude = :latitude, longitude = :longitude, updated_at = NOW()
       WHERE id = :id`,
      {
        replacements: {
          id: salon.id,
          latitude: coords.latitude,
          longitude: coords.longitude,
        },
      },
    );

    console.log(
      `OK: ${salon.salon_name} -> ${coords.latitude}, ${coords.longitude}`,
    );
    updated += 1;
    await delay(1100);
  }

  console.log(`Done. Updated: ${updated}, Failed: ${failed}`);
  await sequelize.close();
  process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
