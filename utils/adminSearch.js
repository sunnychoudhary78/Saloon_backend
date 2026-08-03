'use strict';

const { Op } = require('sequelize');

/**
 * Build an Op.or of ILIKE conditions across flat or nested Sequelize paths.
 * @param {string[]} fields e.g. ['booking_number', '$salon.salon_name$']
 * @param {unknown} term
 * @returns {{ [Op.or]: object[] } | null}
 */
function ilikeOr(fields, term) {
  const trimmed = term == null ? '' : String(term).trim();
  if (!trimmed || !Array.isArray(fields) || fields.length === 0) return null;
  const q = `%${trimmed}%`;
  return {
    [Op.or]: fields.map((field) => ({ [field]: { [Op.iLike]: q } })),
  };
}

/**
 * Merge an Op.or search clause into an existing where object.
 * If where already has Op.or, wraps both in Op.and.
 */
function applySearchOr(where, searchOr) {
  if (!searchOr) return where;
  if (where[Op.or]) {
    const existing = { [Op.or]: where[Op.or] };
    delete where[Op.or];
    const andParts = Object.keys(where).length ? [where, existing, searchOr] : [existing, searchOr];
    return { [Op.and]: andParts };
  }
  return { ...where, ...searchOr };
}

module.exports = {
  ilikeOr,
  applySearchOr,
};
