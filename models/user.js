module.exports = (sequelize, DataTypes) => {
  const baseFields = require('./baseFields');
  const User = sequelize.define(
    'User',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      name: { type: DataTypes.STRING, allowNull: false },
      phone: { type: DataTypes.STRING, allowNull: true, unique: true },
      email: { type: DataTypes.STRING, allowNull: true, unique: true },
      password: { type: DataTypes.STRING, allowNull: true },
      status: {
        type: DataTypes.ENUM('ACTIVE', 'BLOCKED'),
        allowNull: false,
        defaultValue: 'ACTIVE',
      },
      ...baseFields(DataTypes),
    },
    {
      tableName: 'users',
      underscored: true,
    }
  );

  User.associate = (models) => {
    User.belongsToMany(models.Role, {
      through: models.UserRole,
      foreignKey: 'user_id',
      otherKey: 'role_id',
      as: 'Roles',
    });
    User.hasOne(models.SalonOwner, { foreignKey: 'user_id', as: 'salon_owner' });
    User.hasOne(models.Customer, { foreignKey: 'user_id', as: 'customer' });
    User.hasMany(models.TableConfig, { foreignKey: 'user_id' });
    User.hasMany(models.SavedFilter, { foreignKey: 'user_id' });
    User.hasMany(models.Draft, { foreignKey: 'user_id' });
    User.hasMany(models.DeviceToken, { foreignKey: 'user_id', as: 'device_tokens' });
    User.hasMany(models.UserNotification, { foreignKey: 'user_id', as: 'notifications' });
  };

  return User;
};
