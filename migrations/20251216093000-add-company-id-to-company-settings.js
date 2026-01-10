'use strict';

const SCHEMA = 'lms_api';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (t) => {
      // Add company_id column to company_settings
      await queryInterface.addColumn(
        { tableName: 'company_settings', schema: SCHEMA },
        'company_id',
        {
          type: Sequelize.UUID,
          allowNull: true,
        },
        { transaction: t }
      );

      // Add foreign key constraint to companies(id)
      await queryInterface.addConstraint(
        { tableName: 'company_settings', schema: SCHEMA },
        {
          type: 'foreign key',
          fields: ['company_id'],
          name: 'company_settings_company_id_fkey',
          references: {
            table: { schema: SCHEMA, tableName: 'companies' },
            field: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
          transaction: t,
        }
      );

      // Ensure only one settings row per company
      await queryInterface.addConstraint(
        { tableName: 'company_settings', schema: SCHEMA },
        {
          type: 'unique',
          fields: ['company_id'],
          name: 'company_settings_company_id_unique',
          transaction: t,
        }
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.removeConstraint(
        { tableName: 'company_settings', schema: SCHEMA },
        'company_settings_company_id_unique',
        { transaction: t }
      );
      await queryInterface.removeConstraint(
        { tableName: 'company_settings', schema: SCHEMA },
        'company_settings_company_id_fkey',
        { transaction: t }
      );
      await queryInterface.removeColumn(
        { tableName: 'company_settings', schema: SCHEMA },
        'company_id',
        { transaction: t }
      );
    });
  }
};

