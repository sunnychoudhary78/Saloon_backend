function visitKeyFromRow(row) {
  return row.booking_group_id || row.id;
}

const VISIT_KEY_SQL = 'COALESCE(booking_group_id, id)';

module.exports = {
  visitKeyFromRow,
  VISIT_KEY_SQL,
};
