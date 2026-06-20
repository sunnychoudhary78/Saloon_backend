'use strict';

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';

const baseAudit = (Sequelize) => ({
  created_by: { type: Sequelize.UUID, allowNull: true },
  updated_by: { type: Sequelize.UUID, allowNull: true },
  is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
  created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
  updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
});

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable({ schema, tableName: 'payments' }, {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      booking_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: { tableName: 'bookings', schema }, key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      customer_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: { tableName: 'customers', schema }, key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      salon_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: { tableName: 'salons', schema }, key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      payment_type: {
        type: Sequelize.ENUM('SALON_FEE', 'PREMIUM_FEE'),
        allowNull: false,
      },
      amount: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      currency: { type: Sequelize.STRING(3), allowNull: false, defaultValue: 'INR' },
      method: {
        type: Sequelize.ENUM('RAZORPAY', 'PAY_AT_SHOP'),
        allowNull: false,
        defaultValue: 'RAZORPAY',
      },
      status: {
        type: Sequelize.ENUM('PENDING', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED'),
        allowNull: false,
        defaultValue: 'PENDING',
      },
      razorpay_order_id: { type: Sequelize.STRING, allowNull: true },
      razorpay_payment_id: { type: Sequelize.STRING, allowNull: true },
      razorpay_signature: { type: Sequelize.TEXT, allowNull: true },
      failure_reason: { type: Sequelize.TEXT, allowNull: true },
      paid_at: { type: Sequelize.DATE, allowNull: true },
      expires_at: { type: Sequelize.DATE, allowNull: true },
      ...baseAudit(Sequelize),
    });

    await queryInterface.addIndex(
      { schema, tableName: 'payments' },
      ['booking_id', 'payment_type', 'status'],
      { name: 'payments_booking_type_status_idx' }
    );
    await queryInterface.addIndex(
      { schema, tableName: 'payments' },
      ['razorpay_order_id'],
      { name: 'payments_razorpay_order_idx' }
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable({ schema, tableName: 'payments' });
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${schema}"."enum_payments_status";`);
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${schema}"."enum_payments_method";`);
    await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${schema}"."enum_payments_payment_type";`);
  },
};
