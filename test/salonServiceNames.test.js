'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { SALON_SERVICE_NAMES } = require('../constants/salonServiceNames');

test('exposes the fixed 15 salon service names', () => {
  assert.equal(SALON_SERVICE_NAMES.length, 15);
  assert.deepEqual(SALON_SERVICE_NAMES.slice(0, 3), [
    'Haircut',
    'Beard Trim',
    'Hair Color',
  ]);
  assert.equal(SALON_SERVICE_NAMES.at(-1), 'Groom Package');
  assert.ok(!SALON_SERVICE_NAMES.includes('Other / Custom'));
});
