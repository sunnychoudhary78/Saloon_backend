'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Joi = require('joi');
const {
  validateCreateGalleryPost,
  validateUpdateGalleryPost,
  validateConsent,
} = require('../validators/galleryValidator');

test('validateConsent accepts APPROVED and REJECTED', () => {
  const reqOk = { body: { consent: 'APPROVED' } };
  let calledNext = false;
  validateConsent(reqOk, {}, () => {
    calledNext = true;
  });
  assert.equal(calledNext, true);

  const reqBad = { body: { consent: 'INVALID' } };
  let statusSent = 0;
  validateConsent(reqBad, {
    status: (s) => {
      statusSent = s;
      return { json: () => {} };
    },
  }, () => {});
  assert.equal(statusSent, 400);
});

test('validateCreateGalleryPost handles string boolean is_public', () => {
  const req = {
    body: {
      title: 'Amazing Fade Haircut',
      description: 'Done with razor finish',
      is_public: 'true',
      sort_order: 1,
    },
  };
  let calledNext = false;
  validateCreateGalleryPost(req, {}, () => {
    calledNext = true;
  });
  assert.equal(calledNext, true);
  assert.equal(req.body.is_public, true);
  assert.equal(req.body.title, 'Amazing Fade Haircut');
});

test('validateUpdateGalleryPost strips unknown and allows partial updates', () => {
  const req = {
    body: {
      title: 'New Title',
      is_featured: true,
      random_field: 'strip me',
    },
  };
  let calledNext = false;
  validateUpdateGalleryPost(req, {}, () => {
    calledNext = true;
  });
  assert.equal(calledNext, true);
  assert.equal(req.body.title, 'New Title');
  assert.equal(req.body.is_featured, true);
  assert.equal(req.body.random_field, undefined);
});

