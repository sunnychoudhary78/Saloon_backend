'use strict';

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable({ schema, tableName: 'user_notifications' }, {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: { tableName: 'users', schema }, key: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      type: { type: Sequelize.STRING(50), allowNull: false },
      title: { type: Sequelize.STRING(255), allowNull: false },
      body: { type: Sequelize.TEXT, allowNull: false },
      data: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      read_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
    });

    await queryInterface.addIndex(
      { schema, tableName: 'user_notifications' },
      ['user_id', 'created_at'],
      { name: 'user_notifications_user_id_created_at_idx' },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable({ schema, tableName: 'user_notifications' });
  },
};
