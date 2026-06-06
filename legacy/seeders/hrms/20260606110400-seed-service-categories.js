'use strict';

const schema = process.env.DB_SCHEMA || 'template_schema';

module.exports = {
  up: async (queryInterface) => {
    const categories = [
      { name: 'Haircut', description: 'Hair cutting services', sort_order: 1 },
      { name: 'Hair Color', description: 'Hair coloring services', sort_order: 2 },
      { name: 'Beard', description: 'Beard grooming services', sort_order: 3 },
      { name: 'Facial', description: 'Facial treatments', sort_order: 4 },
      { name: 'Spa', description: 'Spa services', sort_order: 5 },
      { name: 'Massage', description: 'Massage services', sort_order: 6 },
      { name: 'Bridal Makeup', description: 'Bridal makeup services', sort_order: 7 },
    ];

    const now = new Date();
    const { v4: uuidv4 } = require('uuid');

    for (const cat of categories) {
      const [existing] = await queryInterface.sequelize.query(
        `SELECT id FROM ${schema}.service_categories WHERE name = :name LIMIT 1`,
        { replacements: { name: cat.name }, type: queryInterface.sequelize.QueryTypes.SELECT }
      );
      if (!existing) {
        await queryInterface.bulkInsert({ schema, tableName: 'service_categories' }, [{
          id: uuidv4(),
          name: cat.name,
          description: cat.description,
          sort_order: cat.sort_order,
          status: 'ACTIVE',
          created_by: null,
          updated_by: null,
          is_active: true,
          created_at: now,
          updated_at: now,
        }]);
      }
    }
  },

  down: async () => {},
};
