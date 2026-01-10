module.exports = (sequelize, DataTypes) => {
  const baseFields = require('./baseFields');
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    password: { type: DataTypes.STRING, allowNull: true }, // nullable if OAuth
    roleId: { type: DataTypes.UUID, allowNull: false },
    ...baseFields(DataTypes),

  }, {
    tableName: 'users',
    underscored: true
  });

  User.associate = (models) => {
    
    User.belongsTo(models.Role, { foreignKey: 'roleId' });

    User.hasOne(models.EmployeeDetail, {
      foreignKey: 'user_id',
      as: 'employee_detail'
    });

    // optional convenience relations (already suggested earlier)
    User.hasMany(models.EmployeeDetail, {
      foreignKey: 'manager_id',
      as: 'managed_employees'
    });
    User.hasMany(models.EmployeeDetail, {
      foreignKey: 'department_head_id',
      as: 'headed_employees'
    });
  };


  return User;
};
