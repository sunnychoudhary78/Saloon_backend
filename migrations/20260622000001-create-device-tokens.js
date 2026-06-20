'use strict';

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable({ schema, tableName: 'device_tokens' }, {
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
      token: { type: Sequelize.STRING(512), allowNull: false, unique: true },
      platform: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'android' },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
    });

    await queryInterface.addIndex(
      { schema, tableName: 'device_tokens' },
      ['token'],
      { unique: true, name: 'device_tokens_token_unique' },
    );
    await queryInterface.addIndex(
      { schema, tableName: 'device_tokens' },
      ['user_id'],
      { name: 'device_tokens_user_id_idx' },
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable({ schema, tableName: 'device_tokens' });
  },
};
