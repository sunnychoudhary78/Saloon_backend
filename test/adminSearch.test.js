'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const { ilikeOr, applySearchOr } = require('../utils/adminSearch');
const { buildWhereFromFilters } = require('../services/employeeFilterBuilder');
const { couponRegistryByKey, bannerRegistryByKey } = require('../config/columnRegistry');

test('ilikeOr returns null for empty term', () => {
  assert.equal(ilikeOr(['code'], '  '), null);
  assert.equal(ilikeOr(['code'], null), null);
});

test('ilikeOr builds Op.or across fields', () => {
  const clause = ilikeOr(['code', '$salon.salon_name$'], 'cut');
  assert.ok(clause[Op.or]);
  assert.equal(clause[Op.or].length, 2);
  assert.deepEqual(clause[Op.or][0], { code: { [Op.iLike]: '%cut%' } });
  assert.deepEqual(clause[Op.or][1], {
    '$salon.salon_name$': { [Op.iLike]: '%cut%' },
  });
});

test('applySearchOr merges with existing where', () => {
  const merged = applySearchOr({ status: 'ACTIVE' }, ilikeOr(['code'], 'SAVE'));
  assert.equal(merged.status, 'ACTIVE');
  assert.ok(merged[Op.or]);
});

test('buildWhereFromFilters honors coupon searchCols via contextRegistry', () => {
  const { where } = buildWhereFromFilters(
    {
      search: 'SAVE10',
      searchCols: ['code', 'discount_type', 'status'],
    },
    couponRegistryByKey,
  );
  assert.ok(where[Op.or]);
  const paths = where[Op.or].map((part) => Object.keys(part)[0]);
  assert.deepEqual(paths, ['code', 'discount_type', 'status']);
  assert.deepEqual(where[Op.or][0].code, { [Op.iLike]: '%SAVE10%' });
});

test('buildWhereFromFilters honors banner title search', () => {
  const { where } = buildWhereFromFilters(
    {
      search: 'summer',
      searchCols: ['title', 'redirect_type', 'status'],
    },
    bannerRegistryByKey,
  );
  assert.ok(where[Op.or]);
  assert.deepEqual(where[Op.or][0], {
    title: { [Op.iLike]: '%summer%' },
  });
});
