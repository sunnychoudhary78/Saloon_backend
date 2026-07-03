module.exports = (sequelize, DataTypes) => {
  const FinanceSetting = sequelize.define(
    'FinanceSetting',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      current_version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      service_commission_percent: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 10 },
      premium_fee_platform_percent: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 70 },
      premium_fee_salon_percent: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 30 },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false },
    },
    {
      tableName: 'finance_settings',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  FinanceSetting.associate = (models) => {
    FinanceSetting.belongsTo(models.User, { foreignKey: 'updated_by', as: 'updater' });
  };

  return FinanceSetting;
};
