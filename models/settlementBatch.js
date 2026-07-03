module.exports = (sequelize, DataTypes) => {
  const baseFields = require('./baseFields');
  const SettlementBatch = sequelize.define(
    'SettlementBatch',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      batch_number: { type: DataTypes.STRING(20), allowNull: false, unique: true },
      salon_id: { type: DataTypes.UUID, allowNull: false },
      period_start: { type: DataTypes.DATEONLY, allowNull: true },
      period_end: { type: DataTypes.DATEONLY, allowNull: true },
      total_salon_net: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      status: {
        type: DataTypes.ENUM('DRAFT', 'APPROVED', 'SETTLED', 'CANCELLED'),
        allowNull: false,
        defaultValue: 'DRAFT',
      },
      approved_by: { type: DataTypes.UUID, allowNull: true },
      approved_at: { type: DataTypes.DATE, allowNull: true },
      settled_by: { type: DataTypes.UUID, allowNull: true },
      settled_at: { type: DataTypes.DATE, allowNull: true },
      settlement_reference: { type: DataTypes.STRING, allowNull: true },
      notes: { type: DataTypes.TEXT, allowNull: true },
      ...baseFields(DataTypes),
    },
    {
      tableName: 'settlement_batches',
      underscored: true,
    }
  );

  SettlementBatch.associate = (models) => {
    SettlementBatch.belongsTo(models.Salon, { foreignKey: 'salon_id', as: 'salon' });
    SettlementBatch.hasMany(models.SettlementLedger, { foreignKey: 'settlement_batch_id', as: 'ledger_entries' });
  };

  return SettlementBatch;
};
