'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const { Service } = require('../models');
const {
  assertUniqueServiceIdentity,
  mapServiceIdentityConflict,
} = require('../services/serviceIdentityService');

test('allows a service identity when no exact duplicate exists', async (t) => {
  const originalFindOne = Service.findOne;
  t.after(() => {
    Service.findOne = originalFindOne;
  });
  Service.findOne = async () => null;

  await assert.doesNotReject(() =>
    assertUniqueServiceIdentity({
      salonId: 'salon-1',
      serviceName: 'Haircut',
      description: 'Premium styling',
      price: 650,
      serviceFor: 'MEN',
    })
  );
});

test('rejects an exact duplicate with a conflict response', async (t) => {
  const originalFindOne = Service.findOne;
  t.after(() => {
    Service.findOne = originalFindOne;
  });
  Service.findOne = async () => ({ id: 'existing-service' });

  await assert.rejects(
    assertUniqueServiceIdentity({
      salonId: 'salon-1',
      serviceName: ' Haircut ',
      description: 'Premium   styling',
      price: 650,
      serviceFor: 'MEN',
    }),
    (error) =>
      error.statusCode === 409 &&
      error.message === 'An identical service already exists for this salon'
  );
});

test('excludes the current service while validating an update', async (t) => {
  const originalFindOne = Service.findOne;
  t.after(() => {
    Service.findOne = originalFindOne;
  });
  let capturedWhere;
  Service.findOne = async ({ where }) => {
    capturedWhere = where;
    return null;
  };

  await assertUniqueServiceIdentity({
    salonId: 'salon-1',
    serviceName: 'Haircut',
    description: null,
    price: 300,
    serviceFor: 'WOMEN',
    excludeId: 'service-1',
  });

  assert.deepEqual(capturedWhere.id, { [Op.ne]: 'service-1' });
  assert.equal(capturedWhere.service_for, 'WOMEN');
});

test('allows same name and price for different service_for values', async (t) => {
  const originalFindOne = Service.findOne;
  t.after(() => {
    Service.findOne = originalFindOne;
  });
  let capturedWhere;
  Service.findOne = async ({ where }) => {
    capturedWhere = where;
    return null;
  };

  await assertUniqueServiceIdentity({
    salonId: 'salon-1',
    serviceName: 'Haircut',
    description: null,
    price: 300,
    serviceFor: 'WOMEN',
  });

  assert.equal(capturedWhere.service_for, 'WOMEN');
});

test('maps database uniqueness races to the same conflict response', () => {
  const mapped = mapServiceIdentityConflict({
    name: 'SequelizeUniqueConstraintError',
  });

  assert.equal(mapped.statusCode, 409);
  assert.equal(mapped.message, 'An identical service already exists for this salon');
});
