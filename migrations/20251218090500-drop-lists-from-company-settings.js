'use strict';

const SCHEMA = 'lms_api';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (t) => {
      const cols = ['blood_groups', 'marital_statuses', 'genders'];
      for (const c of cols) {
        try {
          await queryInterface.removeColumn({ tableName: 'company_settings', schema: SCHEMA }, c, { transaction: t });
        } catch (e) {
          // ignore if column missing
        }
      }
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.addColumn(
        { tableName: 'company_settings', schema: SCHEMA },
        'blood_groups',
        { type: Sequelize.JSONB, allowNull: true, defaultValue: [] },
        { transaction: t }
      );
      await queryInterface.addColumn(
        { tableName: 'company_settings', schema: SCHEMA },
        'marital_statuses',
        { type: Sequelize.JSONB, allowNull: true, defaultValue: [] },
        { transaction: t }
      );
      await queryInterface.addColumn(
        { tableName: 'company_settings', schema: SCHEMA },
        'genders',
        { type: Sequelize.JSONB, allowNull: true, defaultValue: [] },
        { transaction: t }
      );
    });
  }
};
