'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable({ schema: 'lms_api', tableName: 'payroll_components' }, {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('gen_random_uuid()') },
      employee_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'employee_details', key: 'id' }, onDelete: 'CASCADE', unique: true },

      basic: { type: Sequelize.DECIMAL(12,2) },
      hra: { type: Sequelize.DECIMAL(12,2) },
      conveyance: { type: Sequelize.DECIMAL(12,2) },
      other_allowance: { type: Sequelize.DECIMAL(12,2) },
      bonus: { type: Sequelize.DECIMAL(12,2) },
      gross: { type: Sequelize.DECIMAL(12,2) },

      pf_12: { type: Sequelize.DECIMAL(12,2) },
      esi_075: { type: Sequelize.DECIMAL(12,2) },
      lwf: { type: Sequelize.DECIMAL(12,2) },
      total_deduction: { type: Sequelize.DECIMAL(12,2) },

      pf_13: { type: Sequelize.DECIMAL(12,2) },
      esi_325: { type: Sequelize.DECIMAL(12,2) },
      total_contribution: { type: Sequelize.DECIMAL(12,2) },

      ctc: { type: Sequelize.DECIMAL(12,2) },

      components_json: { type: Sequelize.JSONB },

      is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
      created_by: { type: Sequelize.UUID, allowNull: true },
      updated_by: { type: Sequelize.UUID, allowNull: true },
      created_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.fn('now') },
      updated_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.fn('now') }
    });

    await queryInterface.addIndex('payroll_components', ['employee_id']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable({ schema: 'lms_api', tableName: 'payroll_components' });
  }
};
