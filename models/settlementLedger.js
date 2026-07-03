module.exports = (sequelize, DataTypes) => {
  const SettlementLedger = sequelize.define(
    'SettlementLedger',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      payment_id: { type: DataTypes.UUID, allowNull: false },
      payment_line_item_id: { type: DataTypes.UUID, allowNull: true },
      booking_id: { type: DataTypes.UUID, allowNull: true },
      booking_group_id: { type: DataTypes.UUID, allowNull: false },
      salon_id: { type: DataTypes.UUID, allowNull: false },
      entry_type: {
        type: DataTypes.ENUM(
          'SERVICE_COMMISSION',
          'SERVICE_SALON_NET',
          'PREMIUM_PLATFORM',
          'PREMIUM_SALON',
          'REFUND',
          'ADJUSTMENT'
        ),
        allowNull: false,
      },
      amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'INR' },
      settings_version: { type: DataTypes.INTEGER, allowNull: false },
      source_commission_percent: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
      source_split_percent: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
      status: {
        type: DataTypes.ENUM('PENDING', 'IN_BATCH', 'SETTLED', 'REVERSED'),
        allowNull: false,
        defaultValue: 'PENDING',
      },
      settlement_batch_id: { type: DataTypes.UUID, allowNull: true },
      settled_at: { type: DataTypes.DATE, allowNull: true },
      settlement_reference: { type: DataTypes.STRING, allowNull: true },
      notes: { type: DataTypes.TEXT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      tableName: 'settlement_ledger',
      underscored: true,
      timestamps: false,
      createdAt: 'created_at',
      updatedAt: false,
    }
  );

  SettlementLedger.associate = (models) => {
    SettlementLedger.belongsTo(models.Payment, { foreignKey: 'payment_id', as: 'payment' });
    SettlementLedger.belongsTo(models.PaymentLineItem, { foreignKey: 'payment_line_item_id', as: 'line_item' });
    SettlementLedger.belongsTo(models.Salon, { foreignKey: 'salon_id', as: 'salon' });
    SettlementLedger.belongsTo(models.SettlementBatch, { foreignKey: 'settlement_batch_id', as: 'settlement_batch' });
  };

  return SettlementLedger;
};
