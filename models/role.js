module.exports = (sequelize, DataTypes) => {
  const baseFields = require('./baseFields');
  const Role = sequelize.define(
    'Role',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      hierarchy_level: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 500,
        validate: { isInt: true, min: 0 },
      },
      ...baseFields(DataTypes, { userIdType: DataTypes.UUID }),
    },
    {
      tableName: 'roles',
      underscored: true,
    }
  );

  Role.associate = (models) => {
    Role.belongsToMany(models.User, {
      through: models.UserRole,
      foreignKey: 'role_id',
      otherKey: 'user_id',
      as: 'users',
    });
    if (models.Permission) {
      Role.belongsToMany(models.Permission, {
        through: models.RolePermission || 'role_permissions',
        foreignKey: 'role_id',
        otherKey: 'permission_id',
        as: 'permissions',
      });
    }
    if (models.User) {
      Role.belongsTo(models.User, { foreignKey: 'created_by', as: 'createdBy' });
      Role.belongsTo(models.User, { foreignKey: 'updated_by', as: 'updatedBy' });
    }
  };

  return Role;
};
