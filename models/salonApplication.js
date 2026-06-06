module.exports = (sequelize, DataTypes) => {
  const baseFields = require('./baseFields');
  const SalonApplication = sequelize.define(
    'SalonApplication',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      owner_id: { type: DataTypes.UUID, allowNull: false },
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
      application_status: {
        type: DataTypes.ENUM('PENDING_APPROVAL', 'APPROVED', 'REJECTED'),
        allowNull: false,
        defaultValue: 'PENDING_APPROVAL',
      },
      rejection_reason: { type: DataTypes.TEXT, allowNull: true },
      reviewed_by: { type: DataTypes.UUID, allowNull: true },
      reviewed_at: { type: DataTypes.DATE, allowNull: true },
      ...baseFields(DataTypes),
    },
    {
      tableName: 'salon_applications',
      underscored: true,
    }
  );

  SalonApplication.associate = (models) => {
    SalonApplication.belongsTo(models.SalonOwner, { foreignKey: 'owner_id', as: 'owner' });
    SalonApplication.belongsTo(models.User, { foreignKey: 'reviewed_by', as: 'reviewer' });
    SalonApplication.hasOne(models.Salon, { foreignKey: 'application_id', as: 'salon' });
  };

  return SalonApplication;
};
