'use strict';

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';

const quote = (value) => `"${String(value).replace(/"/g, '""')}"`;
const qualified = (name) => `${quote(schema)}.${quote(name)}`;

/** Unambiguous remaps from legacy flattened category names onto the new fixed list. */
const NAME_REMAPS = [
  ['Beard', 'Beard Trim'],
  ['Massage', 'Body Massage'],
  ['Spa', 'Hair Spa'],
  ['Bridal Makeup', 'Groom Package'],
];

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const [fromName, toName] of NAME_REMAPS) {
        await queryInterface.sequelize.query(
          `UPDATE ${qualified('services')}
           SET service_name = :toName,
               updated_at = NOW()
           WHERE LOWER(REGEXP_REPLACE(BTRIM(service_name), '\\s+', ' ', 'g'))
               = LOWER(REGEXP_REPLACE(BTRIM(:fromName), '\\s+', ' ', 'g'));`,
          { replacements: { fromName, toName }, transaction }
        );
      }

      // Prefer Head Massage when the legacy massage description clearly indicates head.
      await queryInterface.sequelize.query(
        `UPDATE ${qualified('services')}
         SET service_name = 'Head Massage',
             updated_at = NOW()
         WHERE LOWER(REGEXP_REPLACE(BTRIM(service_name), '\\s+', ' ', 'g')) = 'body massage'
           AND LOWER(COALESCE(description, '')) LIKE '%head massage%';`,
        { transaction }
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const reverse = [
        ['Beard Trim', 'Beard'],
        ['Body Massage', 'Massage'],
        ['Hair Spa', 'Spa'],
        ['Groom Package', 'Bridal Makeup'],
        ['Head Massage', 'Massage'],
      ];
      for (const [fromName, toName] of reverse) {
        await queryInterface.sequelize.query(
          `UPDATE ${qualified('services')}
           SET service_name = :toName,
               updated_at = NOW()
           WHERE LOWER(REGEXP_REPLACE(BTRIM(service_name), '\\s+', ' ', 'g'))
               = LOWER(REGEXP_REPLACE(BTRIM(:fromName), '\\s+', ' ', 'g'));`,
          { replacements: { fromName, toName }, transaction }
        );
      }
    });
  },
};
