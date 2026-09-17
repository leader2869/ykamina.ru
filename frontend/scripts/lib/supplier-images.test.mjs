import { test } from 'node:test';
import assert from 'node:assert/strict';
import { articleFromRow, assertSupplierRows, mergeProductImages } from './supplier-images.mjs';

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
