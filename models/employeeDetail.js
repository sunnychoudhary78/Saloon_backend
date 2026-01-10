'use strict';

const baseFields = require('./baseFields');

module.exports = (sequelize, DataTypes) => {
  const fields = {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },

    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
      unique: true,
    },

    client_name: { type: DataTypes.STRING },
    client_code: { type: DataTypes.STRING },
    payroll_code: { type: DataTypes.STRING, allowNull: false, unique: true },

    associates_name: { type: DataTypes.STRING },

    doj: { type: DataTypes.DATEONLY },
    dob: { type: DataTypes.DATEONLY },
    dol: { type: DataTypes.DATEONLY },

    designation: { type: DataTypes.STRING },
    department_name: { type: DataTypes.STRING },

    company_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'companies', key: 'id' },
      onDelete: 'SET NULL',
    },

    department_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'departments', key: 'id' },
      onDelete: 'SET NULL',
    },
    gender: { type: DataTypes.STRING },

    contact_primary: { type: DataTypes.STRING },
    contact_secondary: { type: DataTypes.STRING },
    email: { type: DataTypes.STRING },
    blood_group: { type: DataTypes.STRING },

    // Manager and Department Head relations (both reference users)
    manager_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
    },
    department_head_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
    },

    total_experience: { type: DataTypes.STRING },
    work_location: { type: DataTypes.STRING },

    work_mode: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'OFFICE',
    },

    hybrid_office_days: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },

    aadhar_number_encrypted: { type: DataTypes.TEXT },
    pan_number_encrypted: { type: DataTypes.TEXT },
    esi_no: { type: DataTypes.STRING },
    uan_no: { type: DataTypes.STRING },

    bank_name: { type: DataTypes.STRING },
    ifsc_code: { type: DataTypes.STRING },
    account_number_encrypted: { type: DataTypes.TEXT },

    marital_status: { type: DataTypes.STRING },
    date_of_marriage: { type: DataTypes.DATEONLY },

    nominee_name: { type: DataTypes.STRING },
    nominee_dob: { type: DataTypes.DATEONLY },
    nominee_relation: { type: DataTypes.STRING },

    father_name: { type: DataTypes.STRING },
    father_dob: { type: DataTypes.DATEONLY },
    mother_name: { type: DataTypes.STRING },
    mother_dob: { type: DataTypes.DATEONLY },

    spouse_name: { type: DataTypes.STRING },
    spouse_dob: { type: DataTypes.DATEONLY },

    basic: { type: DataTypes.DECIMAL(12, 2) },
    hra: { type: DataTypes.DECIMAL(12, 2) },
    conveyance: { type: DataTypes.DECIMAL(12, 2) },
    other_allowance: { type: DataTypes.DECIMAL(12, 2) },
    bonus: { type: DataTypes.DECIMAL(12, 2) },
    gross: { type: DataTypes.DECIMAL(12, 2) },
    ctc: { type: DataTypes.DECIMAL(12, 2) },

    profile_picture: { type: DataTypes.STRING },

    employee_edit_enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'If false, employee cannot edit their details until manager enables',
    },

    is_on_probation: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    probation_end_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    probation_reviewed_by: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    probation_reviewed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    ...baseFields(DataTypes, { userIdType: DataTypes.UUID }),
  };

  const EmployeeDetail = sequelize.define('EmployeeDetail', fields, {
    tableName: 'employee_details',
    underscored: true,
  });

  EmployeeDetail.associate = (models) => {
    EmployeeDetail.belongsTo(models.User, {
      foreignKey: 'user_id',
      as: 'user',
    });

    // Manager
    EmployeeDetail.belongsTo(models.User, {
      foreignKey: 'manager_id',
      as: 'manager',
    });

    // Department Head
    EmployeeDetail.belongsTo(models.User, {
      foreignKey: 'department_head_id',
      as: 'department_head',
    });

    EmployeeDetail.belongsTo(models.Department, {
      foreignKey: 'department_id',
      as: 'department',
    });
    if (models.Company) {
      EmployeeDetail.belongsTo(models.Company, {
        foreignKey: 'company_id',
        as: 'company',
      });
    }

    // Children relations
    EmployeeDetail.hasMany(models.Education, {
      foreignKey: 'employee_id',
      as: 'educations',
    });
    EmployeeDetail.hasMany(models.Experience, {
      foreignKey: 'employee_id',
      as: 'experiences',
    });
    EmployeeDetail.hasMany(models.Address, {
      foreignKey: 'employee_id',
      as: 'addresses',
    });
    EmployeeDetail.hasMany(models.Dependent, {
      foreignKey: 'employee_id',
      as: 'dependents',
    });
    EmployeeDetail.hasMany(models.PayrollComponent, {
      foreignKey: 'employee_id',
      as: 'payroll_components',
    });
    EmployeeDetail.belongsTo(models.User, {
      foreignKey: 'probation_reviewed_by',
      as: 'probation_reviewed_by_user',
    });

    // Audit relations: created_by and updated_by -> User
    EmployeeDetail.belongsTo(models.User, {
      foreignKey: 'created_by',
      as: 'created_by_user',
    });
    EmployeeDetail.belongsTo(models.User, {
      foreignKey: 'updated_by',
      as: 'updated_by_user',
    });
  };

  return EmployeeDetail;
};
