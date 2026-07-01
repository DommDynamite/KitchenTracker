import test from 'node:test';
import assert from 'node:assert';
import { getDb, initDb } from '../database.js';

test('Parent-Child Catalog Naming Derivation and Propagation', async () => {
  await initDb();
  const db = await getDb();

  await db.run('BEGIN TRANSACTION');

  try {
    // 1. Create a parent category product (e.g. Garlic Powder)
    const parentResult = await db.run(`
      INSERT INTO products (name, default_unit, serving_size, serving_unit, servings_per_package, is_parent, is_spice)
      VALUES ('TEST_Garlic_Powder', 'g', 1.0, 'g', 1.0, 1, 1)
    `);
    const parentId = parentResult.lastID;

    // Verify parent created
    const parent = await db.get('SELECT * FROM products WHERE id = ?', [parentId]);
    assert.strictEqual(parent.name, 'TEST_Garlic_Powder');
    assert.strictEqual(parent.is_parent, 1);

    // 2. Simulate child product creation (e.g. brand "McCormick" of parent "TEST_Garlic_Powder")
    const childBrand = 'McCormick';
    let childDerivedName = 'McCormick TEST_Garlic_Powder';

    // Verify that during child creation, name is derived from Brand + Parent Name
    const parentProdForChild = await db.get('SELECT name FROM products WHERE id = ?', [parentId]);
    assert.ok(parentProdForChild);
    
    const computedName = childBrand ? `${childBrand.trim()} ${parentProdForChild.name.trim()}` : parentProdForChild.name.trim();
    assert.strictEqual(computedName, childDerivedName);

    const childResult = await db.run(`
      INSERT INTO products (name, default_unit, serving_size, serving_unit, servings_per_package, parent_product_id, brand, is_parent, is_spice)
      VALUES (?, 'g', 100.0, 'g', 1.0, ?, ?, 0, 1)
    `, [computedName, parentId, childBrand]);
    const childId = childResult.lastID;

    // Verify child name matches computed derived name
    const child = await db.get('SELECT * FROM products WHERE id = ?', [childId]);
    assert.strictEqual(child.name, 'McCormick TEST_Garlic_Powder');
    assert.strictEqual(child.parent_product_id, parentId);

    // 3. Simulate parent product rename (e.g. "TEST_Garlic_Powder" -> "TEST_Garlic_Seasoning")
    const newParentName = 'TEST_Garlic_Seasoning';
    await db.run('UPDATE products SET name = ? WHERE id = ?', [newParentName, parentId]);

    // Propagate the name update to all child products (simulate the backend cascade logic)
    const children = await db.all('SELECT id, brand FROM products WHERE parent_product_id = ?', [parentId]);
    assert.strictEqual(children.length, 1);

    for (const childRecord of children) {
      const updatedDerivedName = childRecord.brand ? `${childRecord.brand.trim()} ${newParentName.trim()}` : newParentName.trim();
      await db.run('UPDATE products SET name = ? WHERE id = ?', [updatedDerivedName, childRecord.id]);
    }

    // Verify child product name was propagated correctly
    const updatedChild = await db.get('SELECT * FROM products WHERE id = ?', [childId]);
    assert.strictEqual(updatedChild.name, 'McCormick TEST_Garlic_Seasoning');

    // 4. Verify child product can have its own image path set
    await db.run('UPDATE products SET image_path = ? WHERE id = ?', ['mccormick_garlic.png', childId]);
    const childWithImage = await db.get('SELECT image_path FROM products WHERE id = ?', [childId]);
    assert.strictEqual(childWithImage.image_path, 'mccormick_garlic.png');

  } finally {
    await db.run('ROLLBACK');
  }
});
