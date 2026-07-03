module.exports = (sequelize, DataTypes) => {
  const PaymentLineItem = sequelize.define(
    'PaymentLineItem',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      payment_id: { type: DataTypes.UUID, allowNull: false },
      booking_id: { type: DataTypes.UUID, allowNull: false },
      service_id: { type: DataTypes.UUID, allowNull: false },
      service_name_snapshot: { type: DataTypes.STRING(255), allowNull: false },
      gross_amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      commission_percent: { type: DataTypes.DECIMAL(5, 2), allowNull: false },
      commission_amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      platform_amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      salon_net_amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      status: {
        type: DataTypes.ENUM('PENDING', 'PAID', 'REFUNDED', 'PARTIALLY_REFUNDED'),
        allowNull: false,
        defaultValue: 'PENDING',
      },
      refunded_amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      settlement_status: {
        type: DataTypes.ENUM('PENDING', 'IN_BATCH', 'SETTLED', 'REVERSED'),
        allowNull: false,
        defaultValue: 'PENDING',
      },
      settlement_batch_id: { type: DataTypes.UUID, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    },
    {
      tableName: 'payment_line_items',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  PaymentLineItem.associate = (models) => {
    PaymentLineItem.belongsTo(models.Payment, { foreignKey: 'payment_id', as: 'payment' });
    PaymentLineItem.belongsTo(models.Booking, { foreignKey: 'booking_id', as: 'booking' });
    PaymentLineItem.belongsTo(models.Service, { foreignKey: 'service_id', as: 'service' });
    PaymentLineItem.belongsTo(models.SettlementBatch, { foreignKey: 'settlement_batch_id', as: 'settlement_batch' });
  };

  return PaymentLineItem;
};
