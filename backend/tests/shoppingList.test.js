import test from 'node:test';
import assert from 'node:assert';
import { getDb, initDb } from '../database.js';

test('Shopping List API database operations - thresholds and buys', async () => {
  await initDb();
  const db = await getDb();

  await db.run('BEGIN TRANSACTION');

  try {
    // 1. Create a product with a minimum stock threshold
    const prodResult = await db.run(`
      INSERT INTO products (name, default_unit, serving_size, serving_unit, servings_per_package, minimum_stock, is_parent)
      VALUES ('TEST_Eggs', 'pcs', 1.0, 'pcs', 12.0, 2, 0)
    `);
    const productId = prodResult.lastID;

    // 2. Add inventory item
    await db.run(`
      INSERT INTO inventory_items (product_id, quantity, original_servings, remaining_servings, purchase_date, status)
      VALUES (?, 1.0, 12.0, 12.0, '2026-07-28', 'unopened')
    `, [productId]);

    // Query active stock sum
    let stockSum = await db.get(`
      SELECT SUM(remaining_servings) as total_remaining 
      FROM inventory_items 
      WHERE product_id = ?
    `, [productId]);
    
    const remainingPackages = stockSum.total_remaining ? (stockSum.total_remaining / 12.0) : 0;
    assert.strictEqual(remainingPackages >= 2, false);
    
    const packagesNeeded = Math.max(0, 2 - remainingPackages);
    assert.strictEqual(packagesNeeded, 1.0);

    // 3. Add a manual item to shopping list
    const shopResult = await db.run(`
      INSERT INTO shopping_list (product_id, amount, unit, is_completed)
      VALUES (?, 5.0, 'pcs', 0)
    `, [productId]);
    const shopId = shopResult.lastID;

    const manualItem = await db.get('SELECT * FROM shopping_list WHERE id = ?', [shopId]);
    assert.strictEqual(manualItem.product_id, productId);
    assert.strictEqual(manualItem.is_completed, 0);

  } finally {
    await db.run('ROLLBACK');
  }
});
