'use strict';

const { v4: uuidv4 } = require('uuid');

// Helper to generate UUID string
const generateUUID = () => uuidv4();

// Helper to create UUID column definition for migrations
const uuidColumn = (allowNull = false, primaryKey = false) => ({
  type: 'UUID',
  allowNull,
  primaryKey,
  defaultValue: Sequelize.literal('gen_random_uuid()')  // PostgreSQL's built-in UUID generator
});

// Helper to create UUID foreign key column definition
const uuidForeignKey = (allowNull = false) => ({
  type: 'UUID',
  allowNull,
  references: null  // Will be filled in by the migration that uses it
});

module.exports = {
  generateUUID,
  uuidColumn,
  uuidForeignKey
};