'use strict';

module.exports = (sequelize, DataTypes) => {
  const Experience = sequelize.define('Experience', {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },

    employee_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'employee_details', key: 'id' },
      onDelete: 'CASCADE',
    },

    company_name: { type: DataTypes.STRING },
    from_date: { type: DataTypes.DATEONLY },
    to_date: { type: DataTypes.DATEONLY },
    designation: { type: DataTypes.STRING },
    responsibilities: { type: DataTypes.TEXT },
    is_current: { type: DataTypes.BOOLEAN, defaultValue: false },
    reason_for_leaving: { type: DataTypes.TEXT },

    // optional: salary at that company
    last_drawn_ctc: { type: DataTypes.DECIMAL(12, 2) },

  }, {
    tableName: 'experiences',
    underscored: true,
  });

  Experience.associate = (models) => {
    Experience.belongsTo(models.EmployeeDetail, { foreignKey: 'employee_id', as: 'employee' });
  };

  return Experience;
};
