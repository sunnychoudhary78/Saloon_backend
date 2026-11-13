module.exports = (sequelize, DataTypes) => {
  const SalonGalleryPost = sequelize.define(
    'SalonGalleryPost',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      salon_id: { type: DataTypes.UUID, allowNull: false },
      staff_id: { type: DataTypes.UUID, allowNull: true },
      service_id: { type: DataTypes.UUID, allowNull: true },
      booking_id: { type: DataTypes.UUID, allowNull: true },
      customer_id: { type: DataTypes.UUID, allowNull: true },
      title: { type: DataTypes.STRING(255), allowNull: true },
      description: { type: DataTypes.TEXT, allowNull: true },
      before_image_url: { type: DataTypes.STRING(500), allowNull: false },
      after_image_url: { type: DataTypes.STRING(500), allowNull: false },
      is_public: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      customer_consent: {
        type: DataTypes.STRING(30),
        allowNull: false,
        defaultValue: 'APPROVED',
      },
      likes_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      is_featured: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    {
      tableName: 'salon_gallery_posts',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  SalonGalleryPost.associate = (models) => {
    SalonGalleryPost.belongsTo(models.Salon, { foreignKey: 'salon_id', as: 'salon' });
    SalonGalleryPost.belongsTo(models.SalonStaff, { foreignKey: 'staff_id', as: 'staff' });
    SalonGalleryPost.belongsTo(models.Service, { foreignKey: 'service_id', as: 'service' });
    SalonGalleryPost.belongsTo(models.Booking, { foreignKey: 'booking_id', as: 'booking' });
    SalonGalleryPost.belongsTo(models.User, { foreignKey: 'customer_id', as: 'customer' });
    SalonGalleryPost.hasMany(models.SalonGalleryLike, { foreignKey: 'post_id', as: 'likes' });
  };

  return SalonGalleryPost;
};

