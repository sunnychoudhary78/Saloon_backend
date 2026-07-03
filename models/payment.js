module.exports = (sequelize, DataTypes) => {
  const baseFields = require('./baseFields');
  const Payment = sequelize.define(
    'Payment',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      booking_id: { type: DataTypes.UUID, allowNull: true },
      booking_group_id: { type: DataTypes.UUID, allowNull: true },
      customer_id: { type: DataTypes.UUID, allowNull: false },
      salon_id: { type: DataTypes.UUID, allowNull: false },
      checkout_kind: {
        type: DataTypes.ENUM('PREMIUM_ONLY', 'SALON_FEE', 'COMBINED'),
        allowNull: true,
      },
      payment_type: {
        type: DataTypes.ENUM('SALON_FEE', 'PREMIUM_FEE'),
        allowNull: true,
      },
      settings_version: { type: DataTypes.INTEGER, allowNull: true },
      service_commission_percent: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
      premium_fee_platform_percent: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
      premium_fee_salon_percent: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
      premium_fee_amount: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      premium_platform_amount: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      premium_salon_amount: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      commission_amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      platform_amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      salon_net_amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'INR' },
      method: {
        type: DataTypes.ENUM('RAZORPAY', 'PAY_AT_SHOP'),
        allowNull: false,
        defaultValue: 'RAZORPAY',
      },
      status: {
        type: DataTypes.ENUM('PENDING', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED'),
        allowNull: false,
        defaultValue: 'PENDING',
      },
      razorpay_order_id: { type: DataTypes.STRING, allowNull: true },
      razorpay_payment_id: { type: DataTypes.STRING, allowNull: true },
      razorpay_signature: { type: DataTypes.TEXT, allowNull: true },
      failure_reason: { type: DataTypes.TEXT, allowNull: true },
      paid_at: { type: DataTypes.DATE, allowNull: true },
      expires_at: { type: DataTypes.DATE, allowNull: true },
      cash_confirmed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      cash_confirmed_amount: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      cash_confirmed_at: { type: DataTypes.DATE, allowNull: true },
      cash_confirmed_by: { type: DataTypes.UUID, allowNull: true },
      refunded_amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      is_legacy: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      ...baseFields(DataTypes),
    },
    {
      tableName: 'payments',
      underscored: true,
    }
  );

  Payment.associate = (models) => {
    Payment.belongsTo(models.Booking, { foreignKey: 'booking_id', as: 'booking' });
    Payment.belongsTo(models.Customer, { foreignKey: 'customer_id', as: 'customer' });
    Payment.belongsTo(models.Salon, { foreignKey: 'salon_id', as: 'salon' });
    Payment.hasMany(models.PaymentLineItem, { foreignKey: 'payment_id', as: 'line_items' });
    Payment.hasMany(models.SettlementLedger, { foreignKey: 'payment_id', as: 'ledger_entries' });
  };

  return Payment;
};
