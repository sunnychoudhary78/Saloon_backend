'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SALON_SERVICE_NAMES,
  MEN_SERVICE_NAMES,
  WOMEN_SERVICE_NAMES,
  SHARED_SERVICE_NAMES,
  MEN_ONLY_SERVICE_NAMES,
  WOMEN_ONLY_SERVICE_NAMES,
  serviceNamesForSalonType,
  isServiceVisibleForAudience,
} = require('../constants/salonServiceNames');

test('exposes shared and gendered salon service catalogs', () => {
  assert.ok(SHARED_SERVICE_NAMES.includes('Haircut'));
  assert.ok(MEN_ONLY_SERVICE_NAMES.includes('Beard Trim'));
  assert.ok(WOMEN_ONLY_SERVICE_NAMES.includes('Bridal Makeup'));
  assert.equal(
    SALON_SERVICE_NAMES.length,
    SHARED_SERVICE_NAMES.length + MEN_ONLY_SERVICE_NAMES.length + WOMEN_ONLY_SERVICE_NAMES.length,
  );
  assert.ok(!SALON_SERVICE_NAMES.includes('Other / Custom'));
});

test('serviceNamesForSalonType scopes by salon type', () => {
  assert.deepEqual(serviceNamesForSalonType('MEN'), MEN_SERVICE_NAMES);
  assert.deepEqual(serviceNamesForSalonType('WOMEN'), WOMEN_SERVICE_NAMES);
  assert.deepEqual(serviceNamesForSalonType('UNISEX'), SALON_SERVICE_NAMES);
  assert.ok(serviceNamesForSalonType('MEN').includes('Beard Trim'));
  assert.ok(!serviceNamesForSalonType('MEN').includes('Bridal Makeup'));
  assert.ok(serviceNamesForSalonType('WOMEN').includes('Bridal Makeup'));
  assert.ok(!serviceNamesForSalonType('WOMEN').includes('Beard Trim'));
});

test('isServiceVisibleForAudience hides opposite-gender-only services', () => {
  assert.equal(isServiceVisibleForAudience('Haircut', 'men'), true);
  assert.equal(isServiceVisibleForAudience('Haircut', 'women'), true);
  assert.equal(isServiceVisibleForAudience('Beard Trim', 'men'), true);
  assert.equal(isServiceVisibleForAudience('Beard Trim', 'women'), false);
  assert.equal(isServiceVisibleForAudience('Bridal Makeup', 'women'), true);
  assert.equal(isServiceVisibleForAudience('Bridal Makeup', 'men'), false);
});
