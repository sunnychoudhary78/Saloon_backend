const columnRegistry = [
    { key: 'user_id', label: 'User Id', source: 'user', path: 'user.id', type: 'uuid' },
    // { key: 'company_id', label: 'Company Id', source: 'employee', path: 'company_id', type: 'uuid' },
    // { key: 'department_id', label: 'Department Id', source: 'employee', path: 'department_id', type: 'uuid' },
    { key: 'role', label: 'Role', source: 'user', path: 'user.Role.name', type: 'string' },
    { key: 'payroll_code', label: 'Employee Id', source: 'employee', path: 'payroll_code', type: 'string' },
    { key: 'client_name', label: 'Client', source: 'employee', path: 'client_name', type: 'string' },
    { key: 'client_code', label: 'Client Code', source: 'employee', path: 'client_code', type: 'string' },
    { key: 'associates_name', label: 'Name', source: 'employee', path: 'associates_name', type: 'string' },
    { key: 'doj', label: 'Date of Joining', source: 'employee', path: 'doj', type: 'date' },
    { key: 'dob', label: 'Date of Birth', source: 'employee', path: 'dob', type: 'date' },
    { key: 'dol', label: 'Date of Leaving', source: 'employee', path: 'dol', type: 'date' },
    { key: 'designation', label: 'Designation', source: 'employee', path: 'designation', type: 'string' },
    { key: 'department_name', label: 'Department', source: 'employee', path: 'department_name', type: 'string' },
    { key: 'company_name', label: 'Company', source: 'company', path: 'company.name', type: 'string' },
    { key: 'gender', label: 'Gender', source: 'employee', path: 'gender', type: 'string' },
    { key: 'contact_primary', label: 'Contact', source: 'employee', path: 'contact_primary', type: 'string' },
    { key: 'contact_secondary', label: 'Secondary Contact', source: 'employee', path: 'contact_secondary', type: 'string' },
    { key: 'email', label: 'Email', source: 'employee', path: 'email', type: 'string' },
    // { key: 'blod_group', label: 'Blood Group', source: 'employee', path: 'blod_group', type: 'string' },
    { key: 'manager_name', label: 'Manager', source: 'employee', path: 'manager.name', type: 'string' },
    { key: 'department_head_name', label: 'Department Head', source: 'employee', path: 'department_head.name', type: 'string' },
    { key: 'total_experience', label: 'Total Experience', source: 'employee', path: 'total_experience', type: 'number' },
    { key: 'work_location', label: 'Work Location', source: 'employee', path: 'work_location', type: 'string' },
    { key: 'aadhar_number_encrypted', label: 'Aadhar Number', source: 'employee', path: 'aadhar_number_encrypted', type: 'string' },
    { key: 'pan_number_encrypted', label: 'PAN Number', source: 'employee', path: 'pan_number_encrypted', type: 'string' },
    { key: 'esi_no', label: 'ESI Number', source: 'employee', path: 'esi_no', type: 'string' },
    { key: 'uan_no', label: 'UAN Number', source: 'employee', path: 'uan_no', type: 'string' },
    { key: 'bank_name', label: 'Bank Name', source: 'employee', path: 'bank_name', type: 'string' },
    { key: 'ifsc_code', label: 'IFSC Code', source: 'employee', path: 'ifsc_code', type: 'string' },
    { key: 'account_number_encrypted', label: 'Account Number', source: 'employee', path: 'account_number_encrypted', type: 'string' },
    { key: 'marital_status', label: 'Marital Status', source: 'employee', path: 'marital_status', type: 'string' },
    { key: 'date_of_marriage', label: 'Date of Marriage', source: 'employee', path: 'date_of_marriage', type: 'date' },
    { key: 'nominee_name', label: 'Nominee Name', source: 'employee', path: 'nominee_name', type: 'string' },
    { key: 'nominee_dob', label: 'Nominee DOB', source: 'employee', path: 'nominee_dob', type: 'date' },
    { key: 'nominee_relation', label: 'Nominee Relation', source: 'employee', path: 'nominee_relation', type: 'string' },
    { key: 'father_name', label: 'Father Name', source: 'employee', path: 'father_name', type: 'string' },
    { key: 'father_dob', label: 'Father DOB', source: 'employee', path: 'father_dob', type: 'date' },
    { key: 'mother_name', label: 'Mother Name', source: 'employee', path: 'mother_name', type: 'string' },
    { key: 'mother_dob', label: 'Mother DOB', source: 'employee', path: 'mother_dob', type: 'date' },
    { key: 'spouse_name', label: 'Spouse Name', source: 'employee', path: 'spouse_name', type: 'string' },
    { key: 'spouse_dob', label: 'Spouse DOB', source: 'employee', path: 'spouse_dob', type: 'date' },
    { key: 'basic', label: 'Basic', source: 'employee', path: 'basic', type: 'number' },
    { key: 'hra', label: 'HRA', source: 'employee', path: 'hra', type: 'number' },
    { key: 'conveyance', label: 'Conveyance', source: 'employee', path: 'conveyance', type: 'number' },
    { key: 'other_allowance', label: 'Other Allowance', source: 'employee', path: 'other_allowance', type: 'number' },
    { key: 'bonus', label: 'Bonus', source: 'employee', path: 'bonus', type: 'number' },
    { key: 'gross', label: 'Gross', source: 'employee', path: 'gross', type: 'number' },
    { key: 'ctc', label: 'CTC', source: 'employee', path: 'ctc', type: 'number' },
    { key: 'is_on_probation', label: 'On Probation', source: 'employee', path: 'is_on_probation', type: 'boolean' },
    { key: 'probation_end_date', label: 'Probation End', source: 'employee', path: 'probation_end_date', type: 'date' },
    { key: 'work_mode', label: 'Work Mode', source: 'employee', path: 'work_mode', type: 'string' },
    { key: 'hybrid_office_days', label: 'Hybrid Office Days', source: 'employee', path: 'hybrid_office_days', type: 'string' },
    // { key: 'probation_reviewed_by_name', label: 'Probation Reviewed By', source: 'employee', path: 'probation_reviewed_by_user.name', type: 'string' },
    { key: 'educations_count', label: 'Educations', source: 'employee', path: 'educations.length', type: 'count' },
    { key: 'experiences_count', label: 'Experiences', source: 'employee', path: 'experiences.length', type: 'count' },
    { key: 'profile_picture', label: 'Profile Picture', source: 'employee', path: 'profile_picture', type: 'string' },
    { key: 'created_at', label: 'Created At', source: 'employee', path: 'created_at', type: 'date' },
    { key: 'updated_at', label: 'Updated At', source: 'employee', path: 'updated_at', type: 'date' },
    { key: 'created_by', label: 'Created By', source: 'employee', path: 'created_by', type: 'string' },
    { key: 'updated_by', label: 'Updated By', source: 'employee', path: 'updated_by', type: 'string' },
    { key: 'is_active', label: 'Is Active', source: 'employee', path: 'is_active', type: 'boolean' },
];

const departmentRegistry = [
    { key: 'name', label: 'Name', source: 'department', path: 'name', type: 'string' },
    { key: 'is_active', label: 'Active', source: 'department', path: 'is_active', type: 'boolean' },
    { key: 'created_at', label: 'Created At', source: 'department', path: 'created_at', type: 'date' },
    { key: 'updated_at', label: 'Updated At', source: 'department', path: 'updated_at', type: 'date' },
    { key: 'created_by', label: 'Created By', source: 'department', path: 'created_by', type: 'string' },
    { key: 'updated_by', label: 'Updated By', source: 'department', path: 'updated_by', type: 'string' },
];




const rolesRegistry = [
    { key: 'name', label: 'Name', source: 'role', path: 'name', type: 'string' },
    { key: 'hierarchy_level', label: 'Hierarchy', source: 'role', path: 'hierarchy_level', type: 'number' },
    { key: 'is_active', label: 'Active', source: 'role', path: 'is_active', type: 'boolean' },
    { key: 'created_at', label: 'Created At', source: 'role', path: 'created_at', type: 'date' },
    { key: 'updated_at', label: 'Updated At', source: 'role', path: 'updated_at', type: 'date' },
    { key: 'created_by', label: 'Created By', source: 'role', path: 'created_by', type: 'string' },
    { key: 'updated_by', label: 'Updated By', source: 'role', path: 'updated_by', type: 'string' },
];

const permissionsRegistry = [
    { key: 'name', label: 'Name', source: 'permission', path: 'name', type: 'string' },
    { key: 'display_name', label: 'Display Name', source: 'permission', path: 'displayName', type: 'string' },
    { key: 'description', label: 'Description', source: 'permission', path: 'description', type: 'string' },
    { key: 'is_active', label: 'Active', source: 'permission', path: 'is_active', type: 'boolean' },
    { key: 'created_at', label: 'Created At', source: 'permission', path: 'created_at', type: 'date' },
    { key: 'updated_at', label: 'Updated At', source: 'permission', path: 'updated_at', type: 'date' },
    { key: 'created_by', label: 'Created By', source: 'permission', path: 'created_by', type: 'string' },
    { key: 'updated_by', label: 'Updated By', source: 'permission', path: 'updated_by', type: 'string' },
];

const registryByKey = Object.fromEntries(columnRegistry.map(c => [c.key, c]));
const departmentRegistryByKey = Object.fromEntries(departmentRegistry.map(c => [c.key, c]));
const rolesRegistryByKey = Object.fromEntries(rolesRegistry.map(c => [c.key, c]));
const permissionsRegistryByKey = Object.fromEntries(permissionsRegistry.map(c => [c.key, c]));

module.exports = { columnRegistry, registryByKey, departmentRegistry, departmentRegistryByKey, rolesRegistry, rolesRegistryByKey, permissionsRegistry, permissionsRegistryByKey };
