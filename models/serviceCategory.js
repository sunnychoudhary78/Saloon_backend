module.exports = (sequelize, DataTypes) => {
  const baseFields = require('./baseFields');
  const ServiceCategory = sequelize.define(
    'ServiceCategory',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      name: { type: DataTypes.STRING, allowNull: false, unique: true },
      description: { type: DataTypes.TEXT, allowNull: true },
      sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      status: {
        type: DataTypes.ENUM('ACTIVE', 'INACTIVE'),
        allowNull: false,
        defaultValue: 'ACTIVE',
      },
      ...baseFields(DataTypes),
    },
    {
      tableName: 'service_categories',
      underscored: true,
    }
  );

  ServiceCategory.associate = (models) => {
    ServiceCategory.hasMany(models.Service, { foreignKey: 'category_id', as: 'services' });
  };

  return ServiceCategory;
};
