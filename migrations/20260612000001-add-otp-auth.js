'use strict';

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn(
      { schema, tableName: 'users' },
      'email',
      { type: Sequelize.STRING, allowNull: true, unique: true }
    );

    await queryInterface.createTable({ schema, tableName: 'phone_otp_sessions' }, {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      phone: { type: Sequelize.STRING, allowNull: false, unique: true },
      otp: { type: Sequelize.STRING, allowNull: false },
      otp_expires_at: { type: Sequelize.DATE, allowNull: false },
      attempt_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
    });

    await queryInterface.addIndex({ schema, tableName: 'phone_otp_sessions' }, ['phone'], {
      unique: true,
      name: 'phone_otp_sessions_phone_unique',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable({ schema, tableName: 'phone_otp_sessions' });
    await queryInterface.changeColumn(
      { schema, tableName: 'users' },
      'email',
      { type: Sequelize.STRING, allowNull: false, unique: true }
    );
  },
};
