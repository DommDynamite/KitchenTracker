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

    // 4. Add a custom / temporary item without product_id
    const customResult = await db.run(`
      INSERT INTO shopping_list (custom_name, amount, unit, is_completed, notes)
      VALUES ('TEST_Paper_Towels', 2.0, 'pack', 0, 'Temporary household item')
    `);
    const customShopId = customResult.lastID;

    const customItem = await db.get(`
      SELECT sl.*, COALESCE(p.name, sl.custom_name) as product_name
      FROM shopping_list sl
      LEFT JOIN products p ON sl.product_id = p.id
      WHERE sl.id = ?
    `, [customShopId]);

    assert.strictEqual(customItem.product_id, null);
    assert.strictEqual(customItem.custom_name, 'TEST_Paper_Towels');
    assert.strictEqual(customItem.product_name, 'TEST_Paper_Towels');
    assert.strictEqual(customItem.amount, 2.0);
    assert.strictEqual(customItem.unit, 'pack');
    assert.strictEqual(customItem.is_completed, 0);

    // 5. Verify exact matching minimum stock does not trigger low stock / shortage
    const tomatoResult = await db.run(`
      INSERT INTO products (name, default_unit, serving_size, serving_unit, servings_per_package, minimum_stock, is_parent, package_type)
      VALUES ('TEST_Tomato_Paste', 'cans', 10.0, 'g', 1.0, 4, 0, 'can')
    `);
    const tomatoId = tomatoResult.lastID;

    // Add 4 cans of inventory
    for (let i = 0; i < 4; i++) {
      await db.run(`
        INSERT INTO inventory_items (product_id, quantity, original_servings, remaining_servings, purchase_date, status)
        VALUES (?, 1.0, 1.0, 1.0, '2026-08-10', 'unopened')
      `, [tomatoId]);
    }

    const tomatoStockSum = await db.get(`
      SELECT SUM(remaining_servings) as total_remaining 
      FROM inventory_items 
      WHERE product_id = ?
    `, [tomatoId]);
    
    const cleanTotal = Math.round(tomatoStockSum.total_remaining * 10000) / 10000;
    const tomatoShortage = Math.max(0, Math.round((4 - cleanTotal) * 10000) / 10000);
    assert.strictEqual(tomatoShortage <= 0.001, true);
    assert.strictEqual(tomatoShortage === 0, true);

  } finally {
    await db.run('ROLLBACK');
  }
});
