module.exports = (sequelize, DataTypes) => {
  const UserRole = sequelize.define(
    'UserRole',
    {
      user_id: { type: DataTypes.UUID, primaryKey: true },
      role_id: { type: DataTypes.UUID, primaryKey: true },
      assigned_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      assigned_by: { type: DataTypes.UUID, allowNull: true },
    },
    {
      tableName: 'user_roles',
      underscored: true,
      timestamps: false,
    }
  );

  UserRole.associate = (models) => {
    UserRole.belongsTo(models.User, { foreignKey: 'user_id' });
    UserRole.belongsTo(models.Role, { foreignKey: 'role_id' });
  };

  return UserRole;
};
