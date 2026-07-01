import test from 'node:test';
import assert from 'node:assert';
import { getDb, initDb } from '../database.js';

test('Spice Rack Integration - Quick Add and Percentage Rotation', async () => {
  await initDb();
  const db = await getDb();

  await db.run('BEGIN TRANSACTION');

  try {
    // 1. Create a parent spice category spec
    const parentSpiceResult = await db.run(`
      INSERT INTO products (name, default_unit, serving_size, serving_unit, servings_per_package, is_parent, is_spice, spice_reorder_percentage)
      VALUES ('TEST_SPICE_Onion_Powder', 'g', 100.0, 'g', 1.0, 1, 1, 25.0)
    `);
    const parentSpiceId = parentSpiceResult.lastID;

    // 2. Create a child brand spice shaker
    const childSpiceResult = await db.run(`
      INSERT INTO products (name, default_unit, serving_size, serving_unit, servings_per_package, is_parent, is_spice, parent_product_id, brand)
      VALUES ('TEST_SPICE_McCormick_Onion_Powder', 'g', 100.0, 'g', 1.0, 0, 1, ?, 'McCormick')
    `, [parentSpiceId]);
    const childSpiceId = childSpiceResult.lastID;

    // 3. Verify total containers is initially 0
    let items = await db.all(`
      SELECT * FROM inventory_items WHERE product_id = ? AND status IN ('opened', 'unopened')
    `, [childSpiceId]);
    assert.strictEqual(items.length, 0);

    // 4. Log grocery purchases (Quick Add)
    // Add two shakers: quantity = 2, expiration = '2030-01-01', percentage = 100
    for (let i = 0; i < 2; i++) {
      await db.run(`
        INSERT INTO inventory_items (product_id, quantity, original_servings, remaining_servings, expiration_date, purchase_date, status)
        VALUES (?, 1, 1.0, 1.0, '2030-01-01', '2026-06-30', 'unopened')
      `, [childSpiceId]);
    }

    // Set first container to 'opened'
    const oldestItem = await db.get(`
      SELECT * FROM inventory_items 
      WHERE product_id = ? AND status = 'unopened'
      ORDER BY id ASC
    `, [childSpiceId]);
    
    assert.ok(oldestItem);
    
    await db.run(`
      UPDATE inventory_items SET status = 'opened' WHERE id = ?
    `, [oldestItem.id]);

    // Check count: should be 1 opened, 1 unopened
    items = await db.all(`
      SELECT * FROM inventory_items WHERE product_id = ? AND status IN ('opened', 'unopened')
    `, [childSpiceId]);
    assert.strictEqual(items.length, 2);
    
    const openedItems = items.filter(ii => ii.status === 'opened');
    const unopenedItems = items.filter(ii => ii.status === 'unopened');
    assert.strictEqual(openedItems.length, 1);
    assert.strictEqual(unopenedItems.length, 1);

    // 5. Update active shaker percentage to 15% (which triggers reorder warning as 15 < 25)
    await db.run(`
      UPDATE inventory_items SET remaining_servings = 0.15 WHERE id = ?
    `, [openedItems[0].id]);

    const activeItemUpdated = await db.get(`
      SELECT * FROM inventory_items WHERE id = ?
    `, [openedItems[0].id]);
    assert.strictEqual(activeItemUpdated.remaining_servings, 0.15);

    // 6. Update percentage to 0% (shaker consumed)
    await db.run(`
      UPDATE inventory_items SET status = 'consumed', remaining_servings = 0 WHERE id = ?
    `, [openedItems[0].id]);

    // Rotate oldest backup
    const nextBackup = await db.get(`
      SELECT * FROM inventory_items 
      WHERE product_id = ? AND status = 'unopened'
      ORDER BY id ASC
    `, [childSpiceId]);
    
    assert.ok(nextBackup);
    await db.run(`
      UPDATE inventory_items 
      SET status = 'opened', remaining_servings = 1.0 
      WHERE id = ?
    `, [nextBackup.id]);

    // Check post-rotation state
    const rotatedActive = await db.get(`
      SELECT * FROM inventory_items WHERE id = ?
    `, [nextBackup.id]);
    assert.strictEqual(rotatedActive.status, 'opened');
    assert.strictEqual(rotatedActive.remaining_servings, 1.0);

    const oldActive = await db.get(`
      SELECT * FROM inventory_items WHERE id = ?
    `, [openedItems[0].id]);
    assert.strictEqual(oldActive.status, 'consumed');

  } finally {
    await db.run('ROLLBACK');
  }
});
