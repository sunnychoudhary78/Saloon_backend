// models/baseFields.js
module.exports = (DataTypes, opts = {}) => {
  const userIdType = opts.userIdType || DataTypes.INTEGER; // default to INTEGER
  return {
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_by: { type: userIdType, allowNull: true },
    updated_by: { type: userIdType, allowNull: true },
    created_at: { allowNull: false, type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { allowNull: false, type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  };
}
