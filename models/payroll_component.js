'use strict';

module.exports = (sequelize, DataTypes) => {
  const PayrollComponent = sequelize.define('PayrollComponent', {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },

    employee_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'employee_details', key: 'id' },
      onDelete: 'CASCADE',
    },

    component_code: { type: DataTypes.STRING }, // e.g., 'BASIC','HRA','CONV'
    component_name: { type: DataTypes.STRING },
    amount: { type: DataTypes.DECIMAL(12, 2) },
    type: { type: DataTypes.STRING }, // 'earning'|'deduction'
    calculation: { type: DataTypes.STRING }, // optional formula or notes

  }, {
    tableName: 'payroll_components',
    underscored: true,
  });

  PayrollComponent.associate = (models) => {
    PayrollComponent.belongsTo(models.EmployeeDetail, { foreignKey: 'employee_id', as: 'employee' });
  };

  return PayrollComponent;
};
