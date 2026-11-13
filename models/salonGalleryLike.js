module.exports = (sequelize, DataTypes) => {
  const SalonGalleryLike = sequelize.define(
    'SalonGalleryLike',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      post_id: { type: DataTypes.UUID, allowNull: false },
      user_id: { type: DataTypes.UUID, allowNull: false },
    },
    {
      tableName: 'salon_gallery_likes',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      indexes: [
        {
          unique: true,
          fields: ['post_id', 'user_id'],
          name: 'salon_gallery_likes_post_user_uq',
        },
      ],
    }
  );

  SalonGalleryLike.associate = (models) => {
    SalonGalleryLike.belongsTo(models.SalonGalleryPost, { foreignKey: 'post_id', as: 'post' });
    SalonGalleryLike.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return SalonGalleryLike;
};

