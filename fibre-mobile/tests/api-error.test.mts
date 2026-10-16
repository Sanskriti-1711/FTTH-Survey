// ── Server-message tests ───────────────────────────────────────────────────
// Run with:  npm test        (node --test tests/)
//
// A failed request used to report the status and nothing else, so "Request
// failed with status 400" was what an engineer read when they typed the wrong
// password — and it is what the production login call actually answers with
// (measured: POST /api/users/login/ -> 400 {"non_field_errors":["Invalid
// credentials"]}). These tests pin the body's own reason coming through, for
// every shape the API produces, and the status remaining the fallback.

import test from 'node:test';
import assert from 'node:assert/strict';

import { apiErrorMessage, fallbackMessage } from '../lib/utils/api-error.ts';

test('a rejected login says the credentials were wrong, not "status 400"', () => {
  const body = { non_field_errors: ['Invalid credentials'] };
  assert.equal(apiErrorMessage(body, 400), 'Invalid credentials');
});

test('a whole-request detail wins over any field errors beside it', () => {
  const body = {
    detail: 'Given token not valid for any token type',
    email: ['This field is required.'],
  };
  assert.equal(apiErrorMessage(body, 401), 'Given token not valid for any token type');
});

test('a field error keeps the field it is about', () => {
  const body = {
    feature: ['Invalid pk "443c2320-1c4e-4b0a-9f6a-2f9b1f0d5e77" - object does not exist.'],
  };
  assert.equal(
    apiErrorMessage(body, 400),
    'feature: Invalid pk "443c2320-1c4e-4b0a-9f6a-2f9b1f0d5e77" - object does not exist.',
  );
});

test('several rejected fields are all reported', () => {
  const body = {
    depth_mm: ['Ensure this value is less than or equal to 2000.'],
    survey_status: ['"submitted" is not a valid choice.'],
  };
  assert.equal(
    apiErrorMessage(body, 400),
    'depth_mm: Ensure this value is less than or equal to 2000.; survey_status: "submitted" is not a valid choice.',
  );
});

test('a nested serializer is walked, not printed as an object', () => {
  const body = { items: [{ name: ['This field is required.'] }] };
  assert.equal(apiErrorMessage(body, 400), 'items: name: This field is required.');
});

test('a 403 explains the permission, and a 404 the missing thing', () => {
  assert.equal(
    apiErrorMessage({ detail: 'You do not have permission to perform this action.' }, 403),
    'You do not have permission to perform this action.',
  );
  assert.equal(apiErrorMessage({ detail: 'Not found.' }, 404), 'Not found.');
});

test('an HTML or JSON-string body is not shown as a message', () => {
  const html = '<html><head><title>502 Bad Gateway</title></head></html>';
  assert.equal(apiErrorMessage(html, 502), fallbackMessage(502));
  assert.equal(apiErrorMessage('{"detail": "nested"}', 500), fallbackMessage(500));
});

test('a plain-text body is still a message', () => {
  assert.equal(apiErrorMessage('  Service   Unavailable \n', 503), 'Service Unavailable');
});

test('an empty or unusable body falls back to the status, and says so', () => {
  assert.equal(apiErrorMessage(null, 500), 'Request failed with status 500');
  assert.equal(apiErrorMessage('', 500), 'Request failed with status 500');
  assert.equal(apiErrorMessage({}, 502), 'Request failed with status 502');
  assert.equal(apiErrorMessage({ code: [] }, 502), 'Request failed with status 502');
  assert.equal(apiErrorMessage(undefined, 0), 'Request failed with status 0');
});

test('a body that is a list of messages is joined, not dropped', () => {
  assert.equal(
    apiErrorMessage(['photo: This field is required.', 'notes: This field is required.'], 400),
    'photo: This field is required. notes: This field is required.',
  );
});

test('a long message is trimmed to one readable line', () => {
  const long = `${'x'.repeat(400)}`;
  const message = apiErrorMessage({ detail: long }, 400);
  assert.ok(message.length <= 240, `message was ${message.length} characters`);
  assert.ok(message.endsWith('…'));
  assert.ok(message.startsWith('xxx'));
});

test('an error body does not leak a stack of nesting into the toast', () => {
  const deep = { a: { b: { c: { d: { e: ['too deep to matter'] } } } } };
  assert.equal(apiErrorMessage(deep, 400), fallbackMessage(400));
});
