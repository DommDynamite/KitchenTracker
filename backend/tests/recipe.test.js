import test from 'node:test';
import assert from 'node:assert';
import { getDb } from '../database.js';
import { convertUnit } from '../utils/unitConverter.js';

test('Unit Converter - Basic Conversions', () => {
  // Mass to Mass
  assert.strictEqual(convertUnit(1, 'kg', 'g'), 1000);
  assert.strictEqual(convertUnit(500, 'g', 'kg'), 0.5);

  // Volume to Volume
  assert.strictEqual(convertUnit(1, 'l', 'ml'), 1000);
  assert.strictEqual(Math.round(convertUnit(1, 'cup', 'ml')), 237);
});

test('Unit Converter - Package Unit Recursion Prevention', () => {
  // Product with default_unit = packages, serving_unit = null
  const product = {
    default_unit: 'packages',
    serving_size: 1.0,
    serving_unit: null,
    servings_per_package: 10,
    package_type: 'package'
  };

  // Converting packages to pieces should return the servings count (10)
  const result = convertUnit(1, 'packages', 'pieces', product);
  assert.strictEqual(result, 10);

  // Converting servings to packages
  const packages = convertUnit(1, 'servings', 'packages', product);
  assert.strictEqual(packages, 0.1);
});

test('Recipe deduction and rounding integration test', async () => {
  const db = await getDb();

  // Create temporary test products, recipe, and inventory items
  // We prefix names with 'TEST_REGRESSION_' so they can easily be cleaned up
  await db.run('BEGIN TRANSACTION');

  try {
    // 1. Insert parent product
    const parentResult = await db.run(`
      INSERT INTO products (name, default_unit, serving_size, serving_unit, servings_per_package, is_parent)
      VALUES ('TEST_REGRESSION_Milk', 'ml', 1.0, 'pieces', 1.0, 1)
    `);
    const parentId = parentResult.lastID;

    // 2. Insert child product
    const childResult = await db.run(`
      INSERT INTO products (name, default_unit, serving_size, serving_unit, servings_per_package, parent_product_id)
      VALUES ('TEST_REGRESSION_Milk 1G', 'ml', 240.0, 'ml', 16.0, ?)
    `, [parentId]);
    const childId = childResult.lastID;

    // 3. Insert inventory item under child product (remaining_servings = 8.05)
    const invResult = await db.run(`
      INSERT INTO inventory_items (product_id, quantity, original_servings, remaining_servings, purchase_date, status)
      VALUES (?, 1.0, 16.0, 8.05, '2026-06-26', 'opened')
    `, [childId]);
    const invId = invResult.lastID;

    // 4. Create recipe with parent product needing 1 serving (which should translate to 1 serving = 240 ml of child)
    const recipeResult = await db.run(`
      INSERT INTO recipes (name, servings) VALUES ('TEST_REGRESSION_Recipe', 1.0)
    `);
    const recipeId = recipeResult.lastID;

    await db.run(`
      INSERT INTO recipe_ingredients (recipe_id, product_id, amount, unit)
      VALUES (?, ?, 1.0, 'servings')
    `, [recipeId, parentId]);

    // --- SIMULATE DEDUCTION LOOP EXACTLY LIKE SERVER.JS ---
    
    // Fetch recipe ingredients (with enrichment query)
    const rawIngredients = await db.all(`
      SELECT ri.*, p.name as product_name, p.default_unit as prod_unit, p.serving_size as prod_serving_size, 
             p.serving_unit as prod_serving_unit, p.parent_product_id, p.is_parent, p.package_type, p.servings_per_package
      FROM recipe_ingredients ri
      JOIN products p ON ri.product_id = p.id
      WHERE ri.recipe_id = ?
    `, [recipeId]);

    // Enrich ingredients
    const ingredients = [];
    for (const rawIng of rawIngredients) {
      const prodObj = {
        id: rawIng.product_id,
        name: rawIng.product_name,
        is_parent: rawIng.is_parent,
        default_unit: rawIng.prod_unit,
        serving_size: rawIng.prod_serving_size,
        serving_unit: rawIng.prod_serving_unit,
        parent_product_id: rawIng.parent_product_id,
        package_type: rawIng.package_type,
        servings_per_package: rawIng.servings_per_package
      };
      // Import helper inline/simulated since we test the database structure enrichment
      // Find children & active items to enrich prodObj
      const children = await db.all('SELECT * FROM products WHERE parent_product_id = ?', [prodObj.id]);
      assert.ok(children.length > 0, 'Parent product should have child products');
      
      const activeItems = await db.all(`
        SELECT ii.*, p.serving_size, p.serving_unit, p.servings_per_package
        FROM inventory_items ii
        JOIN products p ON ii.product_id = p.id
        WHERE ii.product_id IN (${children.map(() => '?').join(',')}) AND ii.status IN ('unopened', 'opened')
      `, children.map(c => c.id));
      assert.ok(activeItems.length > 0, 'Should find active inventory items for child products');

      // Sort and take first
      const source = activeItems[0];
      prodObj.servings_per_package = source.servings_per_package;
      prodObj.serving_size = source.serving_size;
      prodObj.serving_unit = source.serving_unit;

      ingredients.push({
        ...rawIng,
        prod_unit: prodObj.default_unit,
        prod_serving_size: prodObj.serving_size,
        prod_serving_unit: prodObj.serving_unit,
        parent_product_id: prodObj.parent_product_id,
        package_type: prodObj.package_type,
        servings_per_package: prodObj.servings_per_package
      });
    }

    assert.strictEqual(ingredients[0].prod_serving_size, 240.0, 'Parent product should inherit serving size from child');
    assert.strictEqual(ingredients[0].prod_serving_unit, 'ml', 'Parent product should inherit serving unit from child');

    const ing = ingredients[0];
    const ingredientProduct = {
      serving_size: ing.prod_serving_size,
      serving_unit: ing.prod_serving_unit,
      default_unit: ing.prod_unit,
      parent_product_id: ing.parent_product_id,
      servings_per_package: ing.servings_per_package,
      package_type: ing.package_type
    };

    const productsGroup = await db.all(`
      SELECT id, serving_size, serving_unit, default_unit, servings_per_package, package_type, is_parent, parent_product_id FROM products 
      WHERE parent_product_id = ? OR id = ?
    `, [ing.product_id, ing.product_id]);

    const productIds = productsGroup.map(p => p.id);
    const totalAmountNeededInProdUnit = convertUnit(ing.amount, ing.unit, ing.prod_unit, ingredientProduct);
    assert.strictEqual(totalAmountNeededInProdUnit, 240.0, 'Should need exactly 240 ml (1 serving of Milk)');

    const inventoryItems = await db.all(`
      SELECT * FROM inventory_items 
      WHERE product_id IN (${productIds.map(() => '?').join(',')}) AND status IN ('unopened', 'opened')
    `, productIds);
    
    let amountRemainingToDeduct = Math.round(totalAmountNeededInProdUnit * 100) / 100;

    for (const item of inventoryItems) {
      if (amountRemainingToDeduct <= 0) break;

      const itemProduct = productsGroup.find(p => Number(p.id) === Number(item.product_id)) || {};
      const itemServingSize = itemProduct.serving_size || 1.0;
      const itemServingUnit = itemProduct.serving_unit || itemProduct.default_unit;

      const remainingInServingUnit = item.remaining_servings * itemServingSize;
      const remainingInProdUnit = convertUnit(remainingInServingUnit, itemServingUnit, ing.prod_unit, itemProduct);

      if (remainingInProdUnit >= amountRemainingToDeduct) {
        const deductInServingUnit = convertUnit(amountRemainingToDeduct, ing.prod_unit, itemServingUnit, itemProduct);
        const deductServings = deductInServingUnit / itemServingSize;

        let newRemainingServings = Math.round((item.remaining_servings - deductServings) * 100) / 100;
        let status = 'opened';
        if (newRemainingServings <= 0) {
          newRemainingServings = 0;
          status = 'consumed';
        }

        await db.run(
          'UPDATE inventory_items SET remaining_servings = ?, status = ? WHERE id = ?',
          [newRemainingServings, status, item.id]
        );

        amountRemainingToDeduct = 0;
      }
    }

    // Verify database state: remaining servings should be rounded and correctly updated
    const updatedItem = await db.get('SELECT * FROM inventory_items WHERE id = ?', [invId]);
    assert.strictEqual(updatedItem.remaining_servings, 7.05, 'Should correctly deduct exactly 1.0 serving from 8.05, leaving 7.05');

  } finally {
    // Rollback to clean up all DB mutations
    await db.run('ROLLBACK');
  }
});
