'use strict';

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable(
      { schema, tableName: 'customer_favorites' },
      {
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
        salon_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: { tableName: 'salons', schema }, key: 'id' },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE',
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('NOW()'),
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('NOW()'),
        },
      }
    );

    await queryInterface.addIndex(
      { schema, tableName: 'customer_favorites' },
      ['user_id', 'salon_id'],
      {
        unique: true,
        name: 'customer_favorites_user_salon_uq',
      }
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable({ schema, tableName: 'customer_favorites' });
  },
};
