'use strict';

module.exports = (sequelize, DataTypes) => {
  const Dependent = sequelize.define('Dependent', {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },

    employee_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'employee_details', key: 'id' },
      onDelete: 'CASCADE',
    },

    name: { type: DataTypes.STRING },
    relation: { type: DataTypes.STRING }, // e.g., 'spouse','child','father'
    dob: { type: DataTypes.DATEONLY },
    contact: { type: DataTypes.STRING },
    is_emergency_contact: { type: DataTypes.BOOLEAN, defaultValue: false },

  }, {
    tableName: 'dependents',
    underscored: true,
  });

  Dependent.associate = (models) => {
    Dependent.belongsTo(models.EmployeeDetail, { foreignKey: 'employee_id', as: 'employee' });
  };

  return Dependent;
};
