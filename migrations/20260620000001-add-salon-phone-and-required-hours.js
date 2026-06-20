'use strict';

const schema = process.env.DB_SCHEMA || 'salon_booking_schema';
const salonsTable = { schema, tableName: 'salons' };
const applicationsTable = { schema, tableName: 'salon_applications' };

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn(salonsTable, 'phone', {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn(applicationsTable, 'phone', {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.sequelize.query(`
      UPDATE ${schema}.salons s
      SET phone = u.phone
      FROM ${schema}.salon_owners o
      JOIN ${schema}.users u ON u.id = o.user_id
      WHERE s.owner_id = o.id
        AND (s.phone IS NULL OR s.phone = '')
        AND u.phone IS NOT NULL
    `);

    await queryInterface.sequelize.query(`
      UPDATE ${schema}.salon_applications a
      SET phone = u.phone
      FROM ${schema}.salon_owners o
      JOIN ${schema}.users u ON u.id = o.user_id
      WHERE a.owner_id = o.id
        AND (a.phone IS NULL OR a.phone = '')
        AND u.phone IS NOT NULL
    `);

    await queryInterface.sequelize.query(`
      UPDATE ${schema}.salons
      SET opening_time = '09:00:00'
      WHERE opening_time IS NULL
    `);
    await queryInterface.sequelize.query(`
      UPDATE ${schema}.salons
      SET closing_time = '21:00:00'
      WHERE closing_time IS NULL
    `);
    await queryInterface.sequelize.query(`
      UPDATE ${schema}.salon_applications
      SET opening_time = '09:00:00'
      WHERE opening_time IS NULL
    `);
    await queryInterface.sequelize.query(`
      UPDATE ${schema}.salon_applications
      SET closing_time = '21:00:00'
      WHERE closing_time IS NULL
    `);

    await queryInterface.sequelize.query(`
      UPDATE ${schema}.salons
      SET phone = '0000000000'
      WHERE phone IS NULL OR phone = ''
    `);
    await queryInterface.sequelize.query(`
      UPDATE ${schema}.salon_applications
      SET phone = '0000000000'
      WHERE phone IS NULL OR phone = ''
    `);

    await queryInterface.changeColumn(salonsTable, 'phone', {
      type: Sequelize.STRING,
      allowNull: false,
    });
    await queryInterface.changeColumn(salonsTable, 'opening_time', {
      type: Sequelize.TIME,
      allowNull: false,
    });
    await queryInterface.changeColumn(salonsTable, 'closing_time', {
      type: Sequelize.TIME,
      allowNull: false,
    });

    await queryInterface.changeColumn(applicationsTable, 'phone', {
      type: Sequelize.STRING,
      allowNull: false,
    });
    await queryInterface.changeColumn(applicationsTable, 'opening_time', {
      type: Sequelize.TIME,
      allowNull: false,
    });
    await queryInterface.changeColumn(applicationsTable, 'closing_time', {
      type: Sequelize.TIME,
      allowNull: false,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn(salonsTable, 'opening_time', {
      type: Sequelize.TIME,
      allowNull: true,
    });
    await queryInterface.changeColumn(salonsTable, 'closing_time', {
      type: Sequelize.TIME,
      allowNull: true,
    });
    await queryInterface.changeColumn(applicationsTable, 'opening_time', {
      type: Sequelize.TIME,
      allowNull: true,
    });
    await queryInterface.changeColumn(applicationsTable, 'closing_time', {
      type: Sequelize.TIME,
      allowNull: true,
    });

    await queryInterface.removeColumn(salonsTable, 'phone');
    await queryInterface.removeColumn(applicationsTable, 'phone');
  },
};
