module.exports = (sequelize, DataTypes) => {
  const baseFields = require('./baseFields');
  const Service = sequelize.define(
    'Service',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      salon_id: { type: DataTypes.UUID, allowNull: false },
      category_id: { type: DataTypes.UUID, allowNull: false },
      service_name: { type: DataTypes.STRING, allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      duration_minutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 30 },
      price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      discount_price: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      status: {
        type: DataTypes.ENUM('ACTIVE', 'INACTIVE'),
        allowNull: false,
        defaultValue: 'ACTIVE',
      },
      ...baseFields(DataTypes),
    },
    {
      tableName: 'services',
      underscored: true,
    }
  );

  Service.associate = (models) => {
    Service.belongsTo(models.Salon, { foreignKey: 'salon_id', as: 'salon' });
    Service.belongsTo(models.ServiceCategory, { foreignKey: 'category_id', as: 'category' });
    Service.hasMany(models.Booking, { foreignKey: 'service_id', as: 'bookings' });
  };

  return Service;
};
