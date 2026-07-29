import test from 'node:test';
import assert from 'node:assert';
import { getDb, initDb } from '../database.js';

test('Inventory API database operations - consume and adjust', async () => {
  await initDb();
  const db = await getDb();

  await db.run('BEGIN TRANSACTION');

  try {
    // 1. Insert product
    const prodResult = await db.run(`
      INSERT INTO products (name, default_unit, serving_size, serving_unit, servings_per_package, is_parent)
      VALUES ('TEST_INVENTORY_Milk', 'ml', 240.0, 'ml', 10.0, 0)
    `);
    const productId = prodResult.lastID;

    // 2. Insert inventory item
    const invResult = await db.run(`
      INSERT INTO inventory_items (product_id, quantity, original_servings, remaining_servings, purchase_date, status)
      VALUES (?, 1.0, 10.0, 10.0, '2026-07-28', 'unopened')
    `, [productId]);
    const invId = invResult.lastID;

    // Verify insertion
    const item = await db.get('SELECT * FROM inventory_items WHERE id = ?', [invId]);
    assert.strictEqual(item.remaining_servings, 10.0);
    assert.strictEqual(item.status, 'unopened');

    // 3. Simulate consuming portions
    const consumedAmount = 3.0;
    const newRemaining = Math.max(0, item.remaining_servings - consumedAmount);
    
    await db.run(`
      UPDATE inventory_items 
      SET remaining_servings = ?, status = 'opened' 
      WHERE id = ?
    `, [newRemaining, invId]);

    const updatedItem = await db.get('SELECT * FROM inventory_items WHERE id = ?', [invId]);
    assert.strictEqual(updatedItem.remaining_servings, 7.0);
    assert.strictEqual(updatedItem.status, 'opened');

  } finally {
    await db.run('ROLLBACK');
  }
});
