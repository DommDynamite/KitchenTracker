import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'kitchen.db');

export async function getDb() {
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });
  
  // Enable foreign key support
  await db.run('PRAGMA foreign_keys = ON;');
  
  return db;
}

export async function initDb() {
  const db = await getDb();
  
  // 1. products table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      barcode TEXT UNIQUE,
      parent_product_id INTEGER,
      brand TEXT,
      image_path TEXT,
      category TEXT,
      default_unit TEXT NOT NULL,
      servings_per_package REAL NOT NULL DEFAULT 1.0,
      serving_size REAL NOT NULL DEFAULT 1.0,
      serving_unit TEXT NOT NULL,
      minimum_stock REAL NOT NULL DEFAULT 0.0,
      default_consumption REAL NOT NULL DEFAULT 1.0,
      use_by_days_after_opening INTEGER,
      package_type TEXT DEFAULT 'package',
      calories_per_serving INTEGER DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_product_id) REFERENCES products(id) ON DELETE SET NULL
    );
  `);

  // Migration: Add default_consumption column to existing products table if it doesn't exist
  try {
    await db.exec('ALTER TABLE products ADD COLUMN default_consumption REAL NOT NULL DEFAULT 1.0;');
  } catch (e) {
    // Column already exists, safe to ignore
  }

  // Migration: Add use_by_days_after_opening column to existing products table if it doesn't exist
  try {
    await db.exec('ALTER TABLE products ADD COLUMN use_by_days_after_opening INTEGER;');
  } catch (e) {
    // Column already exists, safe to ignore
  }

  // Migration: Add package_type column to existing products table if it doesn't exist
  try {
    await db.exec("ALTER TABLE products ADD COLUMN package_type TEXT DEFAULT 'package';");
  } catch (e) {
    // Column already exists, safe to ignore
  }

  // Migration: Add calories_per_serving column to existing products table if it doesn't exist
  try {
    await db.exec("ALTER TABLE products ADD COLUMN calories_per_serving INTEGER DEFAULT NULL;");
  } catch (e) {
    // Column already exists, safe to ignore
  }

  // Create indexes for performance
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_products_parent ON products(parent_product_id);`);

  // 2. inventory_items table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS inventory_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      quantity REAL NOT NULL DEFAULT 1.0,
      original_servings REAL NOT NULL,
      remaining_servings REAL NOT NULL,
      price REAL,
      store_location TEXT,
      storage_location TEXT,
      purchase_date TEXT NOT NULL,
      expiration_date TEXT,
      opened_date TEXT,
      status TEXT NOT NULL DEFAULT 'unopened',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );
  `);

  await db.exec(`CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory_items(product_id);`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_inventory_status ON inventory_items(status);`);

  // 3. recipes table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      servings REAL NOT NULL DEFAULT 1.0,
      image_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 4. recipe_steps table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS recipe_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id INTEGER NOT NULL,
      step_number INTEGER NOT NULL,
      instruction TEXT NOT NULL,
      image_path TEXT,
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
    );
  `);

  await db.exec(`CREATE INDEX IF NOT EXISTS idx_recipe_steps_recipe ON recipe_steps(recipe_id);`);

  // 5. recipe_equipment table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS recipe_equipment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
    );
  `);

  await db.exec(`CREATE INDEX IF NOT EXISTS idx_recipe_equipment_recipe ON recipe_equipment(recipe_id);`);

  // 6. recipe_ingredients table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS recipe_ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      unit TEXT NOT NULL,
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );
  `);

  await db.exec(`CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id);`);

  // 7. shopping_list table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS shopping_list (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      unit TEXT NOT NULL,
      is_completed INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );
  `);

  await db.exec(`CREATE INDEX IF NOT EXISTS idx_shopping_list_product ON shopping_list(product_id);`);

  // 8. storage_locations table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS storage_locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.exec(`CREATE INDEX IF NOT EXISTS idx_storage_locations_name ON storage_locations(name);`);

  // Seed storage locations if empty
  const locCount = await db.get('SELECT COUNT(*) as count FROM storage_locations');
  if (locCount.count === 0) {
    console.log('Seeding initial storage locations...');
    const defaults = ['Fridge', 'Pantry', 'Freezer', 'Spice Rack'];
    for (const name of defaults) {
      await db.run('INSERT INTO storage_locations (name) VALUES (?)', [name]);
    }

    // Seed initial values only on a completely fresh database install
    console.log('Seeding initial database...');
    // Seed some products
    // Parent generic products
    const milkParent = await db.run(
      `INSERT INTO products (name, category, default_unit, servings_per_package, serving_size, serving_unit, minimum_stock)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['Whole Milk', 'Dairy', 'ml', 16, 240, 'ml', 1892.71] // 1892.71 ml = 0.5 gallon (minimum stock)
    );
    
    // Child specific products
    await db.run(
      `INSERT INTO products (name, barcode, parent_product_id, brand, default_unit, servings_per_package, serving_size, serving_unit, minimum_stock)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['Great Value Whole Milk 1 Gal', '078742351866', milkParent.lastID, 'Great Value', 'ml', 16.0, 240.0, 'ml', 0.0]
    );

    await db.run(
      `INSERT INTO products (name, barcode, parent_product_id, brand, default_unit, servings_per_package, serving_size, serving_unit, minimum_stock)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['Organic Valley Whole Milk 0.5 Gal', '093966000109', milkParent.lastID, 'Organic Valley', 'ml', 8.0, 240.0, 'ml', 0.0]
    );

    // Standalone product
    const eggs = await db.run(
      `INSERT INTO products (name, barcode, brand, category, default_unit, servings_per_package, serving_size, serving_unit, minimum_stock)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['Large Grade A Eggs 12 Count', '078742211993', 'Great Value', 'Eggs', 'pieces', 12.0, 1.0, 'pieces', 6.0]
    );

    // Seed inventory items
    const today = new Date().toISOString().split('T')[0];
    const expiryMilk = new Date();
    expiryMilk.setDate(expiryMilk.getDate() + 7);
    const expiryMilkStr = expiryMilk.toISOString().split('T')[0];

    const expiryEggs = new Date();
    expiryEggs.setDate(expiryEggs.getDate() + 14);
    const expiryEggsStr = expiryEggs.toISOString().split('T')[0];

    // Add 1 opened Organic Valley Milk (half full - 4 servings left)
    await db.run(
      `INSERT INTO inventory_items (product_id, quantity, original_servings, remaining_servings, price, store_location, storage_location, purchase_date, expiration_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [3, 1, 8.0, 4.0, 4.99, 'Walmart', 'Fridge', today, expiryMilkStr, 'opened']
    );

    // Add 1 dozen eggs (10 eggs remaining)
    await db.run(
      `INSERT INTO inventory_items (product_id, quantity, original_servings, remaining_servings, price, store_location, storage_location, purchase_date, expiration_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [4, 1, 12.0, 10.0, 2.49, 'Walmart', 'Fridge', today, expiryEggsStr, 'opened']
    );

    // Seed a recipe: "Simple Scrambled Eggs"
    const recipe = await db.run(
      `INSERT INTO recipes (name, description, servings)
       VALUES (?, ?, ?)`,
      ['Simple Scrambled Eggs', 'Classic soft scrambled eggs with a splash of milk.', 2.0]
    );

    // recipe steps
    await db.run(
      `INSERT INTO recipe_steps (recipe_id, step_number, instruction)
       VALUES (?, ?, ?)`,
      [recipe.lastID, 1, 'Crack eggs into a bowl, add a splash of milk, and whisk until combined. Season with salt and pepper.']
    );
    await db.run(
      `INSERT INTO recipe_steps (recipe_id, step_number, instruction)
       VALUES (?, ?, ?)`,
      [recipe.lastID, 2, 'Melt butter in a skillet over medium-low heat. Pour in the egg mixture.']
    );
    await db.run(
      `INSERT INTO recipe_steps (recipe_id, step_number, instruction)
       VALUES (?, ?, ?)`,
      [recipe.lastID, 3, 'Cook slowly, stirring constantly, until soft curds form. Serve immediately.']
    );

    // recipe equipment
    await db.run(
      `INSERT INTO recipe_equipment (recipe_id, name)
       VALUES (?, ?)`,
      [recipe.lastID, 'Skillet']
    );
    await db.run(
      `INSERT INTO recipe_equipment (recipe_id, name)
       VALUES (?, ?)`,
      [recipe.lastID, 'Mixing Bowl']
    );
    await db.run(
      `INSERT INTO recipe_equipment (recipe_id, name)
       VALUES (?, ?)`,
      [recipe.lastID, 'Whisk']
    );

    // recipe ingredients (2 eggs, 30 ml milk)
    await db.run(
      `INSERT INTO recipe_ingredients (recipe_id, product_id, amount, unit)
       VALUES (?, ?, ?, ?)`,
      [recipe.lastID, 4, 2.0, 'pieces'] // eggs
    );
    await db.run(
      `INSERT INTO recipe_ingredients (recipe_id, product_id, amount, unit)
       VALUES (?, ?, ?, ?)`,
      [recipe.lastID, 1, 30.0, 'ml'] // Whole Milk (references the parent product!)
    );
  }
}
