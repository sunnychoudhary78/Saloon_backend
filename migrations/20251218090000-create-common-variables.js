'use strict';

const SCHEMA = 'lms_api';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.createTable(
        { tableName: 'common_variables', schema: SCHEMA },
        {
          id: { type: Sequelize.UUID, allowNull: false, primaryKey: true },
          type: { type: Sequelize.STRING, allowNull: false },
          name: { type: Sequelize.STRING, allowNull: false },
          is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
          created_by: { type: Sequelize.UUID, allowNull: true },
          updated_by: { type: Sequelize.UUID, allowNull: true },
          created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
          updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        },
        { transaction: t }
      );

      await queryInterface.addConstraint(
        { tableName: 'common_variables', schema: SCHEMA },
        {
          type: 'unique',
          fields: ['type', 'name'],
          name: 'common_variables_type_name_unique',
          transaction: t
        }
      );

      const [rows] = await queryInterface.sequelize.query(
        `SELECT id, blood_groups, marital_statuses, genders FROM "${SCHEMA}"."company_settings"`,
        { transaction: t }
      );
      const insert = async (type, list) => {
        if (!Array.isArray(list)) return;
        for (const it of list) {
          const name = (it && it.name) ? String(it.name).trim() : (typeof it === 'string' ? it.trim() : '');
          if (!name) continue;
          await queryInterface.sequelize.query(
            `INSERT INTO "${SCHEMA}"."common_variables"(id, type, name, is_active, created_at, updated_at)
             VALUES (gen_random_uuid(), :type, :name, true, NOW(), NOW())
             ON CONFLICT (type, name) DO NOTHING`,
            { replacements: { type, name }, transaction: t }
          );
        }
      };
      for (const r of rows || []) {
        await insert('blood_group', r.blood_groups || []);
        await insert('marital_status', r.marital_statuses || []);
        await insert('gender', r.genders || []);
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.dropTable({ tableName: 'common_variables', schema: SCHEMA }, { transaction: t });
    });
  }
};
