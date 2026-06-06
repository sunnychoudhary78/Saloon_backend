module.exports = (sequelize, DataTypes) => {
  const baseFields = require('./baseFields');
  const Company = sequelize.define('Company', {
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
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    logo_filename: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    ...baseFields(DataTypes, { userIdType: DataTypes.UUID }),
  }, {
    tableName: 'companies',
    underscored: true,
  });
  Company.associate = (models) => {
    if (models.Department) {
      Company.hasMany(models.Department, {
        foreignKey: 'company_id',
        as: 'departments',
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      });
    }
    if (models.User) {
      Company.belongsTo(models.User, { foreignKey: 'created_by', as: 'createdBy' });
      Company.belongsTo(models.User, { foreignKey: 'updated_by', as: 'updatedBy' });
    }
  };
  return Company;
};
