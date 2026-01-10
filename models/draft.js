'use strict';

module.exports = (sequelize, DataTypes) => {
  const Draft = sequelize.define(
    'Draft',
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      user_id: { type: DataTypes.UUID, allowNull: true },
      form_key: { type: DataTypes.STRING, allowNull: false },
      target_id: { type: DataTypes.UUID, allowNull: true },
      data: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      status: {
        type: DataTypes.ENUM('draft', 'submitted', 'archived'),
        allowNull: false,
        defaultValue: 'draft',
      },
      version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      last_saved_at: { type: DataTypes.DATE, allowNull: true },
      created_by: DataTypes.UUID,
      updated_by: DataTypes.UUID,
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
      tableName: 'drafts',
      underscored: true,
    }
  );

  Draft.associate = (models) => {
    Draft.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return Draft;
};
