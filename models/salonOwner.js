module.exports = (sequelize, DataTypes) => {
  const baseFields = require('./baseFields');
  const SalonOwner = sequelize.define(
    'SalonOwner',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      user_id: { type: DataTypes.UUID, allowNull: false, unique: true },
      business_name: { type: DataTypes.STRING, allowNull: false },
      gst_number: { type: DataTypes.STRING, allowNull: true },
      status: {
        type: DataTypes.ENUM('ACTIVE', 'BLOCKED'),
        allowNull: false,
        defaultValue: 'ACTIVE',
      },
      ...baseFields(DataTypes),
    },
    {
      tableName: 'salon_owners',
      underscored: true,
    }
  );

  SalonOwner.associate = (models) => {
    SalonOwner.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    SalonOwner.hasMany(models.SalonApplication, { foreignKey: 'owner_id', as: 'applications' });
    SalonOwner.hasMany(models.Salon, { foreignKey: 'owner_id', as: 'salons' });
  };

  return SalonOwner;
};
