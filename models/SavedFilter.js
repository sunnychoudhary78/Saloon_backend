module.exports = (sequelize, DataTypes) => {
  const SavedFilter = sequelize.define('SavedFilter', {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
    },
    user_id: {
      type: DataTypes.UUID,   // <- changed
      allowNull: false,
    },
    name: { type: DataTypes.STRING, allowNull: false },
    table_key: { type: DataTypes.STRING, allowNull: false },
    filter_json: { type: DataTypes.JSONB, allowNull: false },
    is_shared: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  }, {
    tableName: 'saved_filters',
    underscored: true,
    timestamps: true,
  });

  SavedFilter.associate = function(models) {
    SavedFilter.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return SavedFilter;
};
