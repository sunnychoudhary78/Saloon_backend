const { User, Company, EmployeeDetail, Role } = require('../models');
const { Op } = require('sequelize');
const AppError = require('../middlewares/AppError');

/**
 * GET /api/stats/admin-overview
 * Returns counts for Employees, Companies, and Admins.
 * Requires "stats.read" permission (checked in route).
 */
exports.getAdminOverview = async (req, res, next) => {
  try {
    // 1. Employees Count
    // Count all EmployeeDetail records (active and inactive? usually active is more relevant for dashboard "current status", 
    // but the previous frontend code counted total rows from `employees/query` which might default to all.
    // However, for a high level dashboard, "Active" is usually implied. 
    // Let's stick to ALL for now to match the "Total employees" label, or check if frontend had filters.
    // Frontend code: api.post("/employees/query", { page: 1, limit: 1 })... total.
    // Employee query defaults might return all. 
    // I will count ALL to match "Total employees".
    const employeesCount = await EmployeeDetail.count();

    // 2. Companies Count
    // Same logic.
    const companiesCount = await Company.count();

    // 3. Admins Count
    // "Admins: role 'admin' OR Role.hierarchy_level <= 200, and no employee details"
    const adminsCount = await User.count({
      include: [
        {
          model: Role,
          required: true,
          where: {
            [Op.or]: [
              { name: { [Op.iLike]: '%admin%' } },
              { hierarchy_level: { [Op.lte]: 200 } }
            ]
          }
        },
        {
          model: EmployeeDetail,
          as: 'employee_detail',
          required: false
        }
      ],
      where: {
        '$employee_detail.id$': null
      }
    });

    res.json({
      employeesCount,
      companiesCount,
      adminsCount
    });
  } catch (err) {
    next(err);
  }
};
