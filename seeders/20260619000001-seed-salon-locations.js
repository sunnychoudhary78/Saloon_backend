'use strict';

/**
 * Geo coordinates are now seeded directly in 20260615000003-seed-dummy-salons.js.
 * Kept as a no-op so sequelize-cli seed history / ordering stays stable.
 */
module.exports = {
  up: async () => {
    console.log('Skipping seed-salon-locations (geo is included in dummy salons seeder)');
  },

  down: async () => {
    // Intentional no-op.
  },
};
