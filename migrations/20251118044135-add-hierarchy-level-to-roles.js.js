
// migrations/XXXX-add-hierarchy-level-to-roles.js
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn(
      { tableName: 'roles', schema: 'lms_api' }, // or just 'roles' if not using schema option
      'hierarchy_level',
      {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 500
      }
    );

    await queryInterface.addIndex(
      { tableName: 'roles', schema: 'lms_api' },
      ['hierarchy_level'],
      { name: 'roles_hierarchy_level_idx' }
    );
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex({ tableName: 'roles', schema: 'lms_api' }, 'roles_hierarchy_level_idx');
    await queryInterface.removeColumn({ tableName: 'roles', schema: 'lms_api' }, 'hierarchy_level');
  }
};
