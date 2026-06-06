'use strict';

module.exports = (sequelize, DataTypes) => {
  const Education = sequelize.define('Education', {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },

    // foreign key to employee_details.id
    employee_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'employee_details', key: 'id' },
      onDelete: 'CASCADE',
    },

    // type / level: '10th','12th','Graduation','PG','PhD','Other'
    level: { type: DataTypes.STRING, allowNull: false },

    board_or_university: { type: DataTypes.STRING },
    institution: { type: DataTypes.STRING },

    from_year: { type: DataTypes.INTEGER },
    to_year: { type: DataTypes.INTEGER },
    passing_year: { type: DataTypes.INTEGER },
    percentage: { type: DataTypes.DECIMAL(5, 2) },
    notes: { type: DataTypes.TEXT },

  }, {
    tableName: 'educations',
    underscored: true,
  });

  Education.associate = (models) => {
    Education.belongsTo(models.EmployeeDetail, { foreignKey: 'employee_id', as: 'employee' });
  };

  return Education;
};
