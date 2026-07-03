module.exports = (sequelize, DataTypes) => {
  const FinanceSettingsHistory = sequelize.define(
    'FinanceSettingsHistory',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      version: { type: DataTypes.INTEGER, allowNull: false, unique: true },
      service_commission_percent: { type: DataTypes.DECIMAL(5, 2), allowNull: false },
      premium_fee_platform_percent: { type: DataTypes.DECIMAL(5, 2), allowNull: false },
      premium_fee_salon_percent: { type: DataTypes.DECIMAL(5, 2), allowNull: false },
      changed_by: { type: DataTypes.UUID, allowNull: true },
      changed_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      old_values: { type: DataTypes.JSONB, allowNull: false },
      new_values: { type: DataTypes.JSONB, allowNull: false },
      change_reason: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      tableName: 'finance_settings_history',
      underscored: true,
      timestamps: false,
    }
  );

  FinanceSettingsHistory.associate = (models) => {
    FinanceSettingsHistory.belongsTo(models.User, { foreignKey: 'changed_by', as: 'changer' });
  };

  return FinanceSettingsHistory;
};
