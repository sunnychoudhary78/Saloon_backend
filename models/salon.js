module.exports = (sequelize, DataTypes) => {
  const baseFields = require('./baseFields');
  const Salon = sequelize.define(
    'Salon',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      owner_id: { type: DataTypes.UUID, allowNull: false },
      application_id: { type: DataTypes.UUID, allowNull: true, unique: true },
      salon_name: { type: DataTypes.STRING, allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      address: { type: DataTypes.TEXT, allowNull: false },
      city: { type: DataTypes.STRING, allowNull: false },
      state: { type: DataTypes.STRING, allowNull: false },
      latitude: { type: DataTypes.DECIMAL(10, 8), allowNull: true },
      longitude: { type: DataTypes.DECIMAL(11, 8), allowNull: true },
      cover_image: { type: DataTypes.STRING, allowNull: true },
      gallery_images: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      opening_time: { type: DataTypes.TIME, allowNull: true },
      closing_time: { type: DataTypes.TIME, allowNull: true },
      status: {
        type: DataTypes.ENUM('ACTIVE', 'SUSPENDED', 'CLOSED'),
        allowNull: false,
        defaultValue: 'ACTIVE',
      },
      ...baseFields(DataTypes),
    },
    {
      tableName: 'salons',
      underscored: true,
    }
  );

  Salon.associate = (models) => {
    Salon.belongsTo(models.SalonOwner, { foreignKey: 'owner_id', as: 'owner' });
    Salon.belongsTo(models.SalonApplication, { foreignKey: 'application_id', as: 'application' });
    Salon.hasMany(models.Service, { foreignKey: 'salon_id', as: 'services' });
    Salon.hasMany(models.Booking, { foreignKey: 'salon_id', as: 'bookings' });
    Salon.hasMany(models.Review, { foreignKey: 'salon_id', as: 'reviews' });
  };

  return Salon;
};
