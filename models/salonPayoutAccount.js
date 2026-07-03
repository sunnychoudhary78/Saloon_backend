module.exports = (sequelize, DataTypes) => {
  const baseFields = require('./baseFields');
  const SalonPayoutAccount = sequelize.define(
    'SalonPayoutAccount',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      salon_owner_id: { type: DataTypes.UUID, allowNull: false },
      salon_id: { type: DataTypes.UUID, allowNull: true },
      account_holder_name: { type: DataTypes.STRING, allowNull: false },
      account_number_encrypted: { type: DataTypes.TEXT, allowNull: false },
      ifsc_code: { type: DataTypes.STRING(11), allowNull: false },
      upi_id: { type: DataTypes.STRING, allowNull: true },
      is_primary: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      verification_status: {
        type: DataTypes.ENUM('PENDING', 'VERIFIED', 'REJECTED'),
        allowNull: false,
        defaultValue: 'PENDING',
      },
      ...baseFields(DataTypes),
    },
    {
      tableName: 'salon_payout_accounts',
      underscored: true,
    }
  );

  SalonPayoutAccount.associate = (models) => {
    SalonPayoutAccount.belongsTo(models.SalonOwner, { foreignKey: 'salon_owner_id', as: 'owner' });
    SalonPayoutAccount.belongsTo(models.Salon, { foreignKey: 'salon_id', as: 'salon' });
  };

  return SalonPayoutAccount;
};
