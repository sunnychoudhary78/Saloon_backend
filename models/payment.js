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
      booking_id: { type: DataTypes.UUID, allowNull: false },
      customer_id: { type: DataTypes.UUID, allowNull: false },
      salon_id: { type: DataTypes.UUID, allowNull: false },
      payment_type: {
        type: DataTypes.ENUM('SALON_FEE', 'PREMIUM_FEE'),
        allowNull: false,
      },
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
  };

  return Payment;
};
