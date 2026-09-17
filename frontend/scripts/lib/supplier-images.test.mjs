import { test } from 'node:test';
import assert from 'node:assert/strict';
import { articleFromRow, assertSupplierRows, mergeProductImages } from './supplier-images.mjs';
import { exactFireboxModel } from './photobank-exact.mjs';

test('photobank fallback only recognizes whole firebox models, never fireplace kits', () => {
  assert.equal(exactFireboxModel('Электроочаг RealFlame Eugene'), 'eugene');
  assert.equal(exactFireboxModel('Электроочаг EUGENE/ЮДЖИН'), 'eugene');
  assert.equal(exactFireboxModel('Каминокомплект ANDREA с очагом EUGENE'), null);
  assert.notEqual(exactFireboxModel('Электроочаг FOBOS LUX RC'), exactFireboxModel('Электроочаг FOBOS LUX'));
});

test('supports current and legacy article headers; rejects an unrecognized feed', () => {
  assert.equal(articleFromRow({ 'Артикул [CML2_ARTICLE]': ' 200005 ' }), '200005');
  assert.equal(articleFromRow({ 'Артикул [ARTICLE]': '100007' }), '100007');
  assert.throws(() => assertSupplierRows([{ 'New unsupported column': '100007' }]));
  assert.doesNotThrow(() => assertSupplierRows([{ 'Артикул [CML2_ARTICLE]': '100007' }]));
});

test('supplier updates preserve local gallery and manual photo order without duplicates', () => {
  const old = ['/media/realflame/manual.webp', '/media/realflame/gallery.webp', 'https://realflame.ru/upload/old.jpg'];
  assert.deepEqual(mergeProductImages(old, ['/media/realflame/new.webp', '/media/realflame/gallery.webp']), [old[0], old[1], '/media/realflame/new.webp', old[2]]);
  assert.deepEqual(mergeProductImages(old, []), old);
  assert.deepEqual(mergeProductImages(null, []), []);
});
