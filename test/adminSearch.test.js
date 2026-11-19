'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const { ilikeOr, applySearchOr } = require('../utils/adminSearch');
const { buildWhereFromFilters } = require('../services/employeeFilterBuilder');
const { resolveSearchCols } = require('../services/genericQueryService');
const { Reward, Coupon, PromotionalBanner } = require('../models');
const {
  couponRegistryByKey,
  bannerRegistryByKey,
  rewardRegistryByKey,
} = require('../config/columnRegistry');

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

test('resolveSearchCols excludes PostgreSQL ENUM columns and includes reward_code for Rewards', () => {
  const rewardCols = resolveSearchCols(
    Reward,
    ['brand_name', 'title', 'reward_type', 'status'],
    rewardRegistryByKey,
  );
  assert.deepEqual(rewardCols.sort(), ['brand_name', 'reward_code', 'title']);

  const couponCols = resolveSearchCols(
    Coupon,
    ['title', 'code', 'discount_type', 'status'],
    couponRegistryByKey,
  );
  assert.deepEqual(couponCols.sort(), ['code', 'title']);

  const bannerCols = resolveSearchCols(
    PromotionalBanner,
    ['title', 'redirect_type', 'status'],
    bannerRegistryByKey,
  );
  assert.deepEqual(bannerCols, ['title']);
});
