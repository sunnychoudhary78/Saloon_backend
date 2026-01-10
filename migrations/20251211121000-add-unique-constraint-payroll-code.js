"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addConstraint("employee_details", {
      fields: ["payroll_code"],
      type: "unique",
      name: "employee_details_payroll_code_unique",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeConstraint(
      "employee_details",
      "employee_details_payroll_code_unique"
    );
  },
};
