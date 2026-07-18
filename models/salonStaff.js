module.exports = (sequelize, DataTypes) => {
  const baseFields = require('./baseFields');
  const SalonStaff = sequelize.define(
    'SalonStaff',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      salon_id: { type: DataTypes.UUID, allowNull: false },
      name: { type: DataTypes.STRING, allowNull: false },
      profile_image: { type: DataTypes.STRING, allowNull: true },
      status: {
        type: DataTypes.ENUM('ACTIVE', 'INACTIVE'),
        allowNull: false,
        defaultValue: 'ACTIVE',
      },
      sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      ...baseFields(DataTypes),
    },
    {
      tableName: 'salon_staff',
      underscored: true,
    }
  );

  SalonStaff.associate = (models) => {
    SalonStaff.belongsTo(models.Salon, { foreignKey: 'salon_id', as: 'salon' });
    SalonStaff.hasMany(models.Booking, { foreignKey: 'staff_id', as: 'bookings' });
  };

  return SalonStaff;
};
