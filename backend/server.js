import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getDb, initDb } from './database.js';
import { convertUnit, normalizeUnit } from './utils/unitConverter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize DB
await initDb();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Setup uploads folder
const uploadsDir = path.join(__dirname, 'data', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Serve production frontend built files if they exist
const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}

// Multer Config for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// ----------------------------------------------------
// DYNAMIC STOCK LEVEL HELPER
// ----------------------------------------------------
async function getStockLevels() {
  const db = await getDb();
  
  // Get all products that are either parents or standalone (parent_product_id is null)
  const products = await db.all(`
    SELECT * FROM products 
    WHERE parent_product_id IS NULL OR parent_product_id = ''
  `);

  const activeInventory = await db.all(`
    SELECT ii.*, p.default_unit as prod_unit, p.serving_size as prod_serving_size, 
           p.serving_unit as prod_serving_unit, p.parent_product_id, p.name as prod_name, p.brand as prod_brand
    FROM inventory_items ii
    JOIN products p ON ii.product_id = p.id
    WHERE ii.status IN ('unopened', 'opened')
  `);

  const stockMap = [];

  for (const product of products) {
    // Find all children IDs (including self)
    const childProducts = await db.all(`
      SELECT * FROM products WHERE parent_product_id = ? OR id = ?
    `, [product.id, product.id]);

    const ids = childProducts.map(c => c.id);
    
    // Filter active inventory belonging to this product group
    const groupInventory = activeInventory.filter(item => ids.includes(item.product_id));
    
    let totalInDefaultUnit = 0;

    for (const item of groupInventory) {
      // Calculate remaining servings in default units
      // remaining_servings * serving_size (in serving_unit) = amount in serving_unit
      const servingSize = item.prod_serving_size || 1.0;
      const servingUnit = item.prod_serving_unit || item.prod_unit;
      
      const amountInServingUnit = item.remaining_servings * servingSize;
      
      // Convert amount from child's serving_unit to parent's default_unit
      const amountInParentUnit = convertUnit(
        amountInServingUnit,
        servingUnit,
        product.default_unit,
        product
      );
      
      totalInDefaultUnit += amountInParentUnit;
    }

    stockMap.push({
      productId: product.id,
      name: product.name,
      category: product.category,
      defaultUnit: product.default_unit,
      minimumStock: product.minimum_stock,
      currentStock: totalInDefaultUnit,
      isLow: product.minimum_stock > 0 && totalInDefaultUnit < product.minimum_stock,
      shortage: Math.max(0, product.minimum_stock - totalInDefaultUnit)
    });
  }

  return stockMap;
}

// ----------------------------------------------------
// PRODUCT ROUTES
// ----------------------------------------------------

// List all products
app.get('/api/products', async (req, res) => {
  try {
    const db = await getDb();
    const queryParent = req.query.parentsOnly === 'true';
    
    let products;
    if (queryParent) {
      products = await db.all('SELECT * FROM products WHERE parent_product_id IS NULL ORDER BY name ASC');
    } else {
      // Fetch products and resolve parent names if any
      products = await db.all(`
        SELECT p1.*, p2.name as parent_name 
        FROM products p1
        LEFT JOIN products p2 ON p1.parent_product_id = p2.id
        ORDER BY p1.name ASC
      `);
    }
    
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Barcode Lookup
app.get('/api/products/barcode/:barcode', async (req, res) => {
  try {
    const db = await getDb();
    const product = await db.get('SELECT * FROM products WHERE barcode = ?', [req.params.barcode]);
    if (!product) {
      return res.status(404).json({ message: 'Product not found for barcode' });
    }
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Single Product details & stock
app.get('/api/products/:id', async (req, res) => {
  try {
    const db = await getDb();
    const product = await db.get('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    // If it's a parent, fetch child products
    let children = [];
    if (!product.parent_product_id) {
      children = await db.all('SELECT * FROM products WHERE parent_product_id = ?', [product.id]);
    }
    
    // Fetch active inventory for this product or its children
    const productIds = [product.id, ...children.map(c => c.id)];
    const inventory = await db.all(`
      SELECT ii.*, p.name as product_name, p.brand as product_brand
      FROM inventory_items ii
      JOIN products p ON ii.product_id = p.id
      WHERE ii.product_id IN (${productIds.map(() => '?').join(',')}) AND ii.status IN ('unopened', 'opened')
      ORDER BY ii.expiration_date ASC, ii.purchase_date ASC
    `, productIds);

    res.json({ product, children, inventory });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create product
app.post('/api/products', async (req, res) => {
  const {
    name, barcode, parent_product_id, brand, category,
    default_unit, servings_per_package, serving_size, serving_unit, minimum_stock, default_consumption, use_by_days_after_opening, image_path,
    package_type, calories_per_serving
  } = req.body;

  if (!name || !default_unit) {
    return res.status(400).json({ error: 'Name and default unit are required' });
  }

  try {
    const db = await getDb();
    const result = await db.run(
      `INSERT INTO products (
        name, barcode, parent_product_id, brand, category,
        default_unit, servings_per_package, serving_size, serving_unit, minimum_stock, default_consumption, use_by_days_after_opening, image_path,
        package_type, calories_per_serving
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name, barcode || null, parent_product_id || null, brand || null, category || null,
        default_unit, servings_per_package || 1.0, serving_size || 1.0, serving_unit || default_unit,
        minimum_stock || 0.0, default_consumption || 1.0, use_by_days_after_opening !== undefined ? use_by_days_after_opening : null, image_path || null,
        package_type || 'package', calories_per_serving !== undefined ? calories_per_serving : null
      ]
    );
    res.status(201).json({ id: result.lastID });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update product
app.put('/api/products/:id', async (req, res) => {
  const {
    name, barcode, parent_product_id, brand, category,
    default_unit, servings_per_package, serving_size, serving_unit, minimum_stock, default_consumption, use_by_days_after_opening, image_path,
    package_type, calories_per_serving
  } = req.body;

  try {
    const db = await getDb();
    await db.run(
      `UPDATE products SET 
        name = ?, barcode = ?, parent_product_id = ?, brand = ?, category = ?,
        default_unit = ?, servings_per_package = ?, serving_size = ?, serving_unit = ?, minimum_stock = ?, default_consumption = ?, use_by_days_after_opening = ?, image_path = ?,
        package_type = ?, calories_per_serving = ?
      WHERE id = ?`,
      [
        name, barcode || null, parent_product_id || null, brand || null, category || null,
        default_unit, servings_per_package, serving_size, serving_unit, minimum_stock, default_consumption || 1.0,
        use_by_days_after_opening !== undefined ? use_by_days_after_opening : null, image_path,
        package_type || 'package', calories_per_serving !== undefined ? calories_per_serving : null,
        req.params.id
      ]
    );
    res.json({ message: 'Product updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Product
app.delete('/api/products/:id', async (req, res) => {
  try {
    const db = await getDb();
    await db.run('DELETE FROM products WHERE id = ?', [req.params.id]);
    res.json({ message: 'Product deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// INVENTORY ROUTES
// ----------------------------------------------------

// List active inventory items
app.get('/api/inventory', async (req, res) => {
  try {
    const db = await getDb();
    const inventory = await db.all(`
      SELECT ii.*, p.name as product_name, p.brand as product_brand, p.image_path as product_image,
             p.category as product_category, p.default_unit as product_unit, 
             p.servings_per_package, p.serving_size, p.serving_unit, p.default_consumption,
             p.use_by_days_after_opening, p.parent_product_id
      FROM inventory_items ii
      JOIN products p ON ii.product_id = p.id
      WHERE ii.status IN ('unopened', 'opened')
      ORDER BY ii.expiration_date ASC, ii.purchase_date ASC
    `);
    res.json(inventory);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add items to inventory
app.post('/api/inventory', async (req, res) => {
  const {
    product_id, quantity, price, store_location, storage_location,
    purchase_date, expiration_date
  } = req.body;

  if (!product_id || !quantity || !purchase_date) {
    return res.status(400).json({ error: 'product_id, quantity, and purchase_date are required' });
  }

  try {
    const db = await getDb();
    await db.run('BEGIN TRANSACTION');

    const product = await db.get('SELECT name, servings_per_package FROM products WHERE id = ?', [product_id]);
    if (!product) {
      await db.run('ROLLBACK');
      return res.status(404).json({ error: 'Product not found' });
    }

    const qty = parseFloat(quantity);
    const numFullPackages = Math.floor(qty);
    const fractionalPackage = qty % 1;
    
    const packagesToInsert = [];
    for (let i = 0; i < numFullPackages; i++) {
      packagesToInsert.push(1.0);
    }
    if (fractionalPackage > 0.001) {
      packagesToInsert.push(fractionalPackage);
    }

    const pricePerUnit = price ? parseFloat(price) / qty : null;
    const ids = [];

    for (const pkgQty of packagesToInsert) {
      const totalServings = pkgQty * product.servings_per_package;
      const pkgPrice = pricePerUnit ? pkgQty * pricePerUnit : null;

      const result = await db.run(
        `INSERT INTO inventory_items (
          product_id, quantity, original_servings, remaining_servings, price, store_location, storage_location,
          purchase_date, expiration_date, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          product_id, pkgQty, totalServings, totalServings, pkgPrice, store_location || null,
          storage_location || null, purchase_date, expiration_date || null, 'unopened'
        ]
      );
      ids.push(result.lastID);
    }

    await db.run(
      `INSERT INTO activity_log (action_type, description, details) VALUES (?, ?, ?)`,
      [
        'add_inventory',
        `Added ${qty} package(s) of ${product.name}`,
        JSON.stringify({
          product_id,
          product_name: product.name,
          quantity: qty,
          inserted_ids: ids
        })
      ]
    );

    await db.run('COMMIT');
    res.status(201).json({ id: ids[0], ids });
  } catch (err) {
    const db = await getDb();
    try { await db.run('ROLLBACK'); } catch (_) {}
    res.status(500).json({ error: err.message });
  }
});

// Update inventory item details or remaining servings manually
app.put('/api/inventory/:id', async (req, res) => {
  const { quantity, remaining_servings, status, opened_date, storage_location, expiration_date } = req.body;

  try {
    const db = await getDb();
    await db.run('BEGIN TRANSACTION');
    
    // Fetch current details
    const item = await db.get('SELECT * FROM inventory_items WHERE id = ?', [req.params.id]);
    if (!item) {
      await db.run('ROLLBACK');
      return res.status(404).json({ error: 'Inventory item not found' });
    }

    // Fetch product details for servings per package and name
    const product = await db.get('SELECT name, servings_per_package FROM products WHERE id = ?', [item.product_id]);
    const servingsPerPackage = product ? product.servings_per_package : 1.0;
    const productName = product ? product.name : 'Unknown Product';

    let nextQuantity = quantity !== undefined ? parseFloat(quantity) : item.quantity;
    let nextOriginalServings = nextQuantity * servingsPerPackage;
    let nextServings = remaining_servings !== undefined ? parseFloat(remaining_servings) : item.remaining_servings;

    // Safety check: remaining servings cannot exceed original servings
    if (nextServings > nextOriginalServings) {
      nextServings = nextOriginalServings;
    }

    let nextStatus = status || item.status;
    if (nextServings <= 0) {
      nextServings = 0;
      nextStatus = 'consumed';
    } else if (nextServings === nextOriginalServings) {
      nextStatus = 'unopened';
    } else {
      nextStatus = 'opened';
    }

    await db.run(
      `UPDATE inventory_items SET
        quantity = ?,
        original_servings = ?,
        remaining_servings = ?,
        status = ?,
        opened_date = ?,
        storage_location = ?,
        expiration_date = ?
      WHERE id = ?`,
      [
        nextQuantity,
        nextOriginalServings,
        nextServings,
        nextStatus,
        opened_date || item.opened_date,
        storage_location || item.storage_location,
        expiration_date || item.expiration_date,
        req.params.id
      ]
    );

    await db.run(
      `INSERT INTO activity_log (action_type, description, details) VALUES (?, ?, ?)`,
      [
        'update_inventory',
        `Updated inventory item of ${productName}`,
        JSON.stringify({
          product_name: productName,
          item_id: item.id,
          previous_state: {
            quantity: item.quantity,
            original_servings: item.original_servings,
            remaining_servings: item.remaining_servings,
            status: item.status,
            opened_date: item.opened_date,
            storage_location: item.storage_location,
            expiration_date: item.expiration_date
          }
        })
      ]
    );

    await db.run('COMMIT');
    res.json({ message: 'Inventory item updated successfully' });
  } catch (err) {
    const db = await getDb();
    try { await db.run('ROLLBACK'); } catch (_) {}
    res.status(500).json({ error: err.message });
  }
});

// Log individual servings consumption
app.post('/api/inventory/:id/consume', async (req, res) => {
  const { servings } = req.body;
  if (!servings || servings <= 0) {
    return res.status(400).json({ error: 'valid servings amount is required' });
  }

  try {
    const db = await getDb();
    await db.run('BEGIN TRANSACTION');

    const item = await db.get('SELECT * FROM inventory_items WHERE id = ?', [req.params.id]);
    if (!item) {
      await db.run('ROLLBACK');
      return res.status(404).json({ error: 'Inventory item not found' });
    }

    const product = await db.get('SELECT name FROM products WHERE id = ?', [item.product_id]);
    const productName = product ? product.name : 'Unknown Product';

    let remaining = item.remaining_servings - servings;
    let status = item.status;
    let opened_date = item.opened_date;

    if (status === 'unopened') {
      status = 'opened';
      opened_date = new Date().toISOString().split('T')[0];
    }

    if (remaining <= 0) {
      remaining = 0;
      status = 'consumed';
    }

    await db.run(
      'UPDATE inventory_items SET remaining_servings = ?, status = ?, opened_date = ? WHERE id = ?',
      [remaining, status, opened_date, req.params.id]
    );

    await db.run(
      `INSERT INTO activity_log (action_type, description, details) VALUES (?, ?, ?)`,
      [
        'consume_inventory',
        `Consumed ${servings} serving(s) of ${productName}`,
        JSON.stringify({
          product_name: productName,
          changed_items: [{
            id: item.id,
            product_id: item.product_id,
            quantity: item.quantity,
            original_servings: item.original_servings,
            price: item.price,
            store_location: item.store_location,
            storage_location: item.storage_location,
            purchase_date: item.purchase_date,
            expiration_date: item.expiration_date,
            created_at: item.created_at,
            remaining_servings: item.remaining_servings,
            status: item.status,
            opened_date: item.opened_date
          }]
        })
      ]
    );

    await db.run('COMMIT');
    res.json({ remainingServings: remaining, status });
  } catch (err) {
    const db = await getDb();
    try { await db.run('ROLLBACK'); } catch (_) {}
    res.status(500).json({ error: err.message });
  }
});

// FIFO consume servings at product level
app.post('/api/inventory/product/:productId/consume', async (req, res) => {
  const { productId } = req.params;
  const { servings } = req.body;
  
  if (!servings || servings <= 0) {
    return res.status(400).json({ error: 'valid servings amount is required' });
  }

  try {
    const db = await getDb();
    const product = await db.get('SELECT * FROM products WHERE id = ?', [productId]);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    let productIds = [product.id];
    if (!product.parent_product_id) {
      const children = await db.all('SELECT id FROM products WHERE parent_product_id = ?', [product.id]);
      productIds = [product.id, ...children.map(c => c.id)];
    }

    const inventoryItems = await db.all(`
      SELECT * FROM inventory_items 
      WHERE product_id IN (${productIds.map(() => '?').join(',')}) AND status IN ('unopened', 'opened')
      ORDER BY expiration_date ASC, purchase_date ASC
    `, productIds);

    let amountRemainingToDeduct = parseFloat(servings);
    let totalConsumed = 0;
    const changedItems = [];

    await db.run('BEGIN TRANSACTION');

    for (const item of inventoryItems) {
      if (amountRemainingToDeduct <= 0) break;

      const remaining = item.remaining_servings;
      if (remaining <= 0) continue;

      const deduct = Math.min(remaining, amountRemainingToDeduct);
      const newRemainingServings = remaining - deduct;
      
      let status = item.status;
      let opened_date = item.opened_date;
      
      if (newRemainingServings <= 0) {
        status = 'consumed';
      } else {
        status = 'opened';
        if (!opened_date) {
          opened_date = new Date().toISOString().split('T')[0];
        }
      }

      changedItems.push({
        id: item.id,
        product_id: item.product_id,
        quantity: item.quantity,
        original_servings: item.original_servings,
        price: item.price,
        store_location: item.store_location,
        storage_location: item.storage_location,
        purchase_date: item.purchase_date,
        expiration_date: item.expiration_date,
        created_at: item.created_at,
        remaining_servings: item.remaining_servings,
        status: item.status,
        opened_date: item.opened_date
      });

      await db.run(
        'UPDATE inventory_items SET remaining_servings = ?, status = ?, opened_date = ? WHERE id = ?',
        [newRemainingServings, status, opened_date, item.id]
      );

      totalConsumed += deduct;
      amountRemainingToDeduct -= deduct;
    }

    if (changedItems.length > 0) {
      await db.run(
        `INSERT INTO activity_log (action_type, description, details) VALUES (?, ?, ?)`,
        [
          'consume_inventory',
          `Consumed ${servings} serving(s) of ${product.name}`,
          JSON.stringify({
            product_name: product.name,
            changed_items: changedItems
          })
        ]
      );
    }

    await db.run('COMMIT');
    res.json({ message: 'Consumption successful', servingsConsumed: totalConsumed });
  } catch (err) {
    const db = await getDb();
    try { await db.run('ROLLBACK'); } catch (_) {}
    res.status(500).json({ error: err.message });
  }
});

// Delete inventory item
app.delete('/api/inventory/:id', async (req, res) => {
  try {
    const db = await getDb();
    await db.run('BEGIN TRANSACTION');

    const item = await db.get('SELECT * FROM inventory_items WHERE id = ?', [req.params.id]);
    if (!item) {
      await db.run('ROLLBACK');
      return res.status(404).json({ error: 'Inventory item not found' });
    }

    const product = await db.get('SELECT name FROM products WHERE id = ?', [item.product_id]);
    const productName = product ? product.name : 'Unknown Product';

    await db.run('DELETE FROM inventory_items WHERE id = ?', [req.params.id]);

    await db.run(
      `INSERT INTO activity_log (action_type, description, details) VALUES (?, ?, ?)`,
      [
        'delete_inventory',
        `Deleted package of ${productName} from inventory`,
        JSON.stringify({
          product_name: productName,
          deleted_item: item
        })
      ]
    );

    await db.run('COMMIT');
    res.json({ message: 'Inventory item deleted' });
  } catch (err) {
    const db = await getDb();
    try { await db.run('ROLLBACK'); } catch (_) {}
    res.status(500).json({ error: err.message });
  }
});

// Get unique store locations previously typed in by the user
app.get('/api/inventory/stores', async (req, res) => {
  try {
    const db = await getDb();
    const stores = await db.all(`
      SELECT DISTINCT store_location FROM inventory_items 
      WHERE store_location IS NOT NULL AND store_location != '' 
      ORDER BY store_location ASC
    `);
    res.json(stores.map(s => s.store_location));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// STORAGE LOCATION ROUTES
// ----------------------------------------------------

// List all storage locations
app.get('/api/locations', async (req, res) => {
  try {
    const db = await getDb();
    const locations = await db.all('SELECT * FROM storage_locations ORDER BY name ASC');
    res.json(locations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a new storage location
app.post('/api/locations', async (req, res) => {
  const { name } = req.body;
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Location name is required' });
  }
  try {
    const db = await getDb();
    const result = await db.run('INSERT INTO storage_locations (name) VALUES (?)', [name.trim()]);
    res.status(201).json({ id: result.lastID, name: name.trim() });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Location already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Update a storage location name (and update inventory_items references)
app.put('/api/locations/:id', async (req, res) => {
  const { name } = req.body;
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Location name is required' });
  }
  try {
    const db = await getDb();
    const oldLoc = await db.get('SELECT name FROM storage_locations WHERE id = ?', [req.params.id]);
    if (!oldLoc) {
      return res.status(404).json({ error: 'Location not found' });
    }
    
    await db.run('BEGIN TRANSACTION');
    await db.run('UPDATE storage_locations SET name = ? WHERE id = ?', [name.trim(), req.params.id]);
    await db.run('UPDATE inventory_items SET storage_location = ? WHERE storage_location = ?', [name.trim(), oldLoc.name]);
    await db.run('COMMIT');
    
    res.json({ message: 'Location updated successfully' });
  } catch (err) {
    const db = await getDb();
    try { await db.run('ROLLBACK'); } catch (_) {}
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Location with that name already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Delete a storage location (and clear references in inventory_items)
app.delete('/api/locations/:id', async (req, res) => {
  try {
    const db = await getDb();
    const loc = await db.get('SELECT name FROM storage_locations WHERE id = ?', [req.params.id]);
    if (!loc) {
      return res.status(404).json({ error: 'Location not found' });
    }
    
    await db.run('BEGIN TRANSACTION');
    await db.run('DELETE FROM storage_locations WHERE id = ?', [req.params.id]);
    await db.run('UPDATE inventory_items SET storage_location = NULL WHERE storage_location = ?', [loc.name]);
    await db.run('COMMIT');
    
    res.json({ message: 'Location deleted successfully' });
  } catch (err) {
    const db = await getDb();
    try { await db.run('ROLLBACK'); } catch (_) {}
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// CATEGORY ROUTES
// ----------------------------------------------------

// Get all categories
app.get('/api/categories', async (req, res) => {
  try {
    const db = await getDb();
    const categories = await db.all('SELECT * FROM categories ORDER BY name ASC');
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add a category
app.post('/api/categories', async (req, res) => {
  const { name, default_storage_location } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Category name is required' });
  }

  try {
    const db = await getDb();
    const result = await db.run(
      'INSERT INTO categories (name, default_storage_location) VALUES (?, ?)',
      [name.trim(), default_storage_location || null]
    );
    res.status(201).json({ id: result.lastID, name: name.trim(), default_storage_location: default_storage_location || null });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Category with that name already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Update a category (name and/or default_storage_location)
app.put('/api/categories/:id', async (req, res) => {
  const { name, default_storage_location } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Category name is required' });
  }

  try {
    const db = await getDb();
    const existing = await db.get('SELECT * FROM categories WHERE id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    await db.run(
      'UPDATE categories SET name = ?, default_storage_location = ? WHERE id = ?',
      [name.trim(), default_storage_location || null, req.params.id]
    );
    res.json({ message: 'Category updated successfully' });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Category with that name already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Delete a category
app.delete('/api/categories/:id', async (req, res) => {
  try {
    const db = await getDb();
    const cat = await db.get('SELECT name FROM categories WHERE id = ?', [req.params.id]);
    if (!cat) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    await db.run('DELETE FROM categories WHERE id = ?', [req.params.id]);
    res.json({ message: 'Category deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// RECIPE ROUTES
// ----------------------------------------------------

// List all recipes
app.get('/api/recipes', async (req, res) => {
  try {
    const db = await getDb();
    const recipes = await db.all('SELECT * FROM recipes ORDER BY name ASC');
    
    // Fetch all recipe ingredients to map them
    const allIngredients = await db.all('SELECT recipe_id, product_id FROM recipe_ingredients');
    
    // Group product IDs by recipe ID
    const recipeIngredientsMap = {};
    for (const ing of allIngredients) {
      if (!recipeIngredientsMap[ing.recipe_id]) {
        recipeIngredientsMap[ing.recipe_id] = [];
      }
      recipeIngredientsMap[ing.recipe_id].push(ing.product_id);
    }
    
    // Enrich recipes with their ingredient product IDs
    const enrichedRecipes = recipes.map(r => ({
      ...r,
      ingredientProductIds: recipeIngredientsMap[r.id] || []
    }));
    
    res.json(enrichedRecipes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get detailed Recipe details, including ingredient checklist availability
app.get('/api/recipes/:id', async (req, res) => {
  try {
    const db = await getDb();
    const recipe = await db.get('SELECT * FROM recipes WHERE id = ?', [req.params.id]);
    if (!recipe) {
      return res.status(404).json({ error: 'Recipe not found' });
    }

    const steps = await db.all('SELECT * FROM recipe_steps WHERE recipe_id = ? ORDER BY step_number ASC', [recipe.id]);
    const equipment = await db.all('SELECT * FROM recipe_equipment WHERE recipe_id = ? ORDER BY name ASC', [recipe.id]);
    
    // Fetch recipe ingredients along with product properties
    const ingredients = await db.all(`
      SELECT ri.*, p.name as product_name, p.default_unit as prod_unit, p.serving_size as prod_serving_size, 
             p.serving_unit as prod_serving_unit, p.parent_product_id, p.calories_per_serving, p.servings_per_package, p.package_type
      FROM recipe_ingredients ri
      JOIN products p ON ri.product_id = p.id
      WHERE ri.recipe_id = ?
    `, [recipe.id]);

    let totalCalories = 0;

    // Check stock for each ingredient
    const stockLevels = await getStockLevels();
    const enrichedIngredients = ingredients.map(ing => {
      // Build dummy product object for unit converter
      const productForConv = {
        serving_size: ing.prod_serving_size,
        serving_unit: ing.prod_serving_unit,
        default_unit: ing.prod_unit,
        servings_per_package: ing.servings_per_package,
        package_type: ing.package_type
      };

      // Calculate servings needed and add to total calories
      const servingsNeeded = convertUnit(ing.amount, ing.unit, 'servings', productForConv);
      const calories = servingsNeeded * (ing.calories_per_serving || 0);
      totalCalories += calories;

      // Find matching product in stockLevels
      let inStockAmount = 0;
      const matchedStock = stockLevels.find(s => s.productId === ing.product_id);
      
      if (matchedStock) {
        // Matched stock contains parent product's cumulative stock
        // Convert recipe ingredient amount from ingredient unit to parent's default unit
        const ingAmountInProdUnit = convertUnit(ing.amount, ing.unit, ing.prod_unit, productForConv);
        inStockAmount = matchedStock.currentStock;
        
        return {
          ...ing,
          inStock: inStockAmount >= ingAmountInProdUnit,
          availableAmount: inStockAmount,
          requiredInProdUnit: ingAmountInProdUnit
        };
      } else {
        // Points to a child product or product that is not a parent
        return {
          ...ing,
          inStock: false,
          availableAmount: 0,
          requiredInProdUnit: ing.amount
        };
      }
    });

    recipe.totalCalories = totalCalories > 0 ? Math.round(totalCalories) : null;

    res.json({ recipe, steps, equipment, ingredients: enrichedIngredients });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create recipe
app.post('/api/recipes', async (req, res) => {
  const { name, description, servings, image_path, steps, equipment, ingredients } = req.body;

  if (!name || !ingredients || ingredients.length === 0) {
    return res.status(400).json({ error: 'Recipe name and ingredients are required' });
  }

  try {
    const db = await getDb();
    
    // Begin transaction manually to ensure atomic writes
    await db.run('BEGIN TRANSACTION');

    const recipeResult = await db.run(
      'INSERT INTO recipes (name, description, servings, image_path) VALUES (?, ?, ?, ?)',
      [name, description || null, servings || 1.0, image_path || null]
    );
    const recipeId = recipeResult.lastID;

    // Insert steps
    if (steps && steps.length > 0) {
      for (let i = 0; i < steps.length; i++) {
        await db.run(
          'INSERT INTO recipe_steps (recipe_id, step_number, instruction, image_path) VALUES (?, ?, ?, ?)',
          [recipeId, i + 1, steps[i].instruction || steps[i], steps[i].image_path || null]
        );
      }
    }

    // Insert equipment
    if (equipment && equipment.length > 0) {
      for (const eq of equipment) {
        await db.run(
          'INSERT INTO recipe_equipment (recipe_id, name) VALUES (?, ?)',
          [recipeId, eq]
        );
      }
    }

    // Insert ingredients
    for (const ing of ingredients) {
      await db.run(
        'INSERT INTO recipe_ingredients (recipe_id, product_id, amount, unit) VALUES (?, ?, ?, ?)',
        [recipeId, ing.product_id, ing.amount, ing.unit]
      );
    }

    await db.run('COMMIT');
    res.status(201).json({ id: recipeId });
  } catch (err) {
    const db = await getDb();
    try { await db.run('ROLLBACK'); } catch (_) {}
    res.status(500).json({ error: err.message });
  }
});

// Update Recipe
app.put('/api/recipes/:id', async (req, res) => {
  const { id } = req.params;
  const { name, description, servings, image_path, steps, equipment, ingredients } = req.body;

  if (!name || !ingredients || ingredients.length === 0) {
    return res.status(400).json({ error: 'Recipe name and ingredients are required' });
  }

  try {
    const db = await getDb();
    
    // Check if recipe exists
    const existingRecipe = await db.get('SELECT * FROM recipes WHERE id = ?', [id]);
    if (!existingRecipe) {
      return res.status(404).json({ error: 'Recipe not found' });
    }

    // Begin transaction manually
    await db.run('BEGIN TRANSACTION');

    // Update main recipe
    await db.run(
      'UPDATE recipes SET name = ?, description = ?, servings = ?, image_path = ? WHERE id = ?',
      [name, description || null, servings || 1.0, image_path || null, id]
    );

    // Delete existing child records
    await db.run('DELETE FROM recipe_steps WHERE recipe_id = ?', [id]);
    await db.run('DELETE FROM recipe_equipment WHERE recipe_id = ?', [id]);
    await db.run('DELETE FROM recipe_ingredients WHERE recipe_id = ?', [id]);

    // Insert updated steps
    if (steps && steps.length > 0) {
      for (let i = 0; i < steps.length; i++) {
        await db.run(
          'INSERT INTO recipe_steps (recipe_id, step_number, instruction, image_path) VALUES (?, ?, ?, ?)',
          [id, i + 1, steps[i].instruction || steps[i], steps[i].image_path || null]
        );
      }
    }

    // Insert updated equipment
    if (equipment && equipment.length > 0) {
      for (const eq of equipment) {
        await db.run(
          'INSERT INTO recipe_equipment (recipe_id, name) VALUES (?, ?)',
          [id, eq]
        );
      }
    }

    // Insert updated ingredients
    for (const ing of ingredients) {
      await db.run(
        'INSERT INTO recipe_ingredients (recipe_id, product_id, amount, unit) VALUES (?, ?, ?, ?)',
        [id, ing.product_id, ing.amount, ing.unit]
      );
    }

    await db.run('COMMIT');
    res.json({ message: 'Recipe updated successfully' });
  } catch (err) {
    const db = await getDb();
    try { await db.run('ROLLBACK'); } catch (_) {}
    res.status(500).json({ error: err.message });
  }
});

// Delete Recipe
app.delete('/api/recipes/:id', async (req, res) => {
  try {
    const db = await getDb();
    await db.run('DELETE FROM recipes WHERE id = ?', [req.params.id]);
    res.json({ message: 'Recipe deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// MAKE RECIPE (FIFO Auto-consumption)
app.post('/api/recipes/:id/make', async (req, res) => {
  try {
    const db = await getDb();
    
    const recipe = await db.get('SELECT id, name FROM recipes WHERE id = ?', [req.params.id]);
    if (!recipe) {
      return res.status(404).json({ error: 'Recipe not found' });
    }

    let ingredients = [];
    if (req.body.ingredients && Array.isArray(req.body.ingredients)) {
      // Custom ingredients sent by frontend
      for (const customIng of req.body.ingredients) {
        const product = await db.get(`
          SELECT name as product_name, default_unit as prod_unit, serving_size as prod_serving_size, 
                 serving_unit as prod_serving_unit, parent_product_id
          FROM products WHERE id = ?
        `, [customIng.product_id]);
        if (product) {
          ingredients.push({
            product_id: customIng.product_id,
            amount: parseFloat(customIng.amount),
            unit: customIng.unit,
            ...product
          });
        }
      }
    } else {
      // Fetch recipe ingredients
      ingredients = await db.all(`
        SELECT ri.*, p.name as product_name, p.default_unit as prod_unit, p.serving_size as prod_serving_size, 
               p.serving_unit as prod_serving_unit, p.parent_product_id
        FROM recipe_ingredients ri
        JOIN products p ON ri.product_id = p.id
        WHERE ri.recipe_id = ?
      `, [req.params.id]);
    }

    const changedItems = [];
    await db.run('BEGIN TRANSACTION');

    for (const ing of ingredients) {
      const ingredientProduct = {
        serving_size: ing.prod_serving_size,
        serving_unit: ing.prod_serving_unit,
        default_unit: ing.prod_unit,
        parent_product_id: ing.parent_product_id
      };

      // Find matching products: either the product itself, or if it is a parent product, its children too.
      const productsGroup = await db.all(`
        SELECT id, serving_size, serving_unit, default_unit FROM products 
        WHERE parent_product_id = ? OR id = ?
      `, [ing.product_id, ing.product_id]);
      
      const productIds = productsGroup.map(p => p.id);

      // Convert recipe required amount to ingredients product base/serving size logic
      // Recipe ingredient amount in ingredient unit -> convert to product default unit
      const totalAmountNeededInProdUnit = convertUnit(ing.amount, ing.unit, ing.prod_unit, ingredientProduct);

      // Fetch active inventory items for these products, sorted by expiration date (FIFO/expiry first)
      const inventoryItems = await db.all(`
        SELECT * FROM inventory_items 
        WHERE product_id IN (${productIds.map(() => '?').join(',')}) AND status IN ('unopened', 'opened')
        ORDER BY expiration_date ASC, purchase_date ASC
      `, productIds);

      let amountRemainingToDeduct = totalAmountNeededInProdUnit;

      for (const item of inventoryItems) {
        if (amountRemainingToDeduct <= 0) break;

        const itemProduct = productsGroup.find(p => Number(p.id) === Number(item.product_id)) || {};
        const itemServingSize = itemProduct.serving_size || 1.0;
        const itemServingUnit = itemProduct.serving_unit || itemProduct.default_unit;

        // How much default unit is left in this item?
        // remaining_servings * serving_size (in serving_unit) = amount in serving_unit
        const remainingInServingUnit = item.remaining_servings * itemServingSize;
        const remainingInProdUnit = convertUnit(remainingInServingUnit, itemServingUnit, ing.prod_unit, ingredientProduct);

        if (remainingInProdUnit <= 0) continue;

        // Capture item state before modifying
        changedItems.push({
          id: item.id,
          product_id: item.product_id,
          quantity: item.quantity,
          original_servings: item.original_servings,
          price: item.price,
          store_location: item.store_location,
          storage_location: item.storage_location,
          purchase_date: item.purchase_date,
          expiration_date: item.expiration_date,
          created_at: item.created_at,
          remaining_servings: item.remaining_servings,
          status: item.status,
          opened_date: item.opened_date
        });

        if (remainingInProdUnit >= amountRemainingToDeduct) {
          // This item satisfies the remaining amount needed
          // Convert amountRemainingToDeduct to item's serving unit, then divide by serving_size to get servings
          const deductInServingUnit = convertUnit(amountRemainingToDeduct, ing.prod_unit, itemServingUnit, itemProduct);
          const deductServings = deductInServingUnit / itemServingSize;

          let newRemainingServings = item.remaining_servings - deductServings;
          let status = 'opened';
          if (newRemainingServings <= 0) {
            newRemainingServings = 0;
            status = 'consumed';
          }

          await db.run(
            'UPDATE inventory_items SET remaining_servings = ?, status = ?, opened_date = COALESCE(opened_date, ?) WHERE id = ?',
            [newRemainingServings, status, new Date().toISOString().split('T')[0], item.id]
          );

          amountRemainingToDeduct = 0;
        } else {
          // Deduct everything from this item, and move to the next item
          await db.run(
            'UPDATE inventory_items SET remaining_servings = 0, status = "consumed", opened_date = COALESCE(opened_date, ?) WHERE id = ?',
            [new Date().toISOString().split('T')[0], item.id]
          );

          amountRemainingToDeduct -= remainingInProdUnit;
        }
      }

      if (amountRemainingToDeduct > 0) {
        // If we ran out of inventory, raise error and rollback
        throw new Error(`Insufficient inventory for ingredient ${ing.product_name}. Missing ${amountRemainingToDeduct} ${ing.prod_unit}.`);
      }
    }

    if (changedItems.length > 0) {
      await db.run(
        `INSERT INTO activity_log (action_type, description, details) VALUES (?, ?, ?)`,
        [
          'make_recipe',
          `Made recipe: ${recipe.name}`,
          JSON.stringify({
            recipe_id: recipe.id,
            recipe_name: recipe.name,
            changed_items: changedItems
          })
        ]
      );
    }

    await db.run('COMMIT');
    res.json({ message: 'Recipe made! Ingredients consumed successfully.' });
  } catch (err) {
    const db = await getDb();
    try { await db.run('ROLLBACK'); } catch (_) {}
    res.status(400).json({ error: err.message });
  }
});

// Helper endpoint to perform unit conversions using backend converter library
app.get('/api/convert-unit', async (req, res) => {
  try {
    const { amount, from, to, product_id } = req.query;
    if (!amount || !from || !to) {
      return res.status(400).json({ error: 'amount, from, and to are required' });
    }
    const amt = parseFloat(amount);
    if (isNaN(amt)) {
      return res.status(400).json({ error: 'amount must be a valid number' });
    }
    
    let product = {};
    if (product_id) {
      const db = await getDb();
      product = await db.get('SELECT * FROM products WHERE id = ?', [product_id]) || {};
    }
    
    const result = convertUnit(amt, from, to, product);
    res.json({ result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// SHOPPING LIST ROUTES (MANUAL + AUTO)
// ----------------------------------------------------

// Get complete shopping list
app.get('/api/shopping-list', async (req, res) => {
  try {
    const db = await getDb();
    
    // 1. Fetch manual list items
    const manualItems = await db.all(`
      SELECT sl.*, p.name as product_name, p.brand as product_brand, p.category as product_category
      FROM shopping_list sl
      JOIN products p ON sl.product_id = p.id
      WHERE sl.is_completed = 0
    `);

    // 2. Fetch stock levels to compile low stock recommendations
    const stockLevels = await getStockLevels();
    const autoItems = stockLevels
      .filter(stock => stock.isLow)
      .map(stock => ({
        id: `auto-${stock.productId}`,
        product_id: stock.productId,
        product_name: stock.name,
        product_brand: null,
        product_category: stock.category,
        amount: stock.shortage,
        unit: stock.defaultUnit,
        is_auto: true,
        notes: `Auto-generated: stock (${stock.currentStock.toFixed(1)} ${stock.defaultUnit}) is below minimum (${stock.minimumStock} ${stock.defaultUnit}).`
      }));

    res.json({ manual: manualItems, auto: autoItems });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add manual item
app.post('/api/shopping-list', async (req, res) => {
  const { product_id, amount, unit, notes } = req.body;

  if (!product_id || !amount || !unit) {
    return res.status(400).json({ error: 'product_id, amount, and unit are required' });
  }

  try {
    const db = await getDb();
    const result = await db.run(
      'INSERT INTO shopping_list (product_id, amount, unit, notes) VALUES (?, ?, ?, ?)',
      [product_id, amount, unit, notes || null]
    );
    res.status(201).json({ id: result.lastID });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete item
app.delete('/api/shopping-list/:id', async (req, res) => {
  try {
    const db = await getDb();
    await db.run('DELETE FROM shopping_list WHERE id = ?', [req.params.id]);
    res.json({ message: 'Shopping list item deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Complete shopping list purchase (logs the items to inventory and archives list item)
app.post('/api/shopping-list/purchase', async (req, res) => {
  const { items } = req.body; // Array of { product_id, quantity, price, store_location, storage_location, list_item_id, expiration_date }
  
  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'purchased items are required' });
  }

  try {
    const db = await getDb();
    await db.run('BEGIN TRANSACTION');

    const today = new Date().toISOString().split('T')[0];
    const insertedIds = [];
    const completedListIds = [];

    for (const item of items) {
      const product = await db.get('SELECT servings_per_package FROM products WHERE id = ?', [item.product_id]);
      if (!product) continue;

      const qty = parseFloat(item.quantity);
      const numFullPackages = Math.floor(qty);
      const fractionalPackage = qty % 1;
      
      const packagesToInsert = [];
      for (let i = 0; i < numFullPackages; i++) {
        packagesToInsert.push(1.0);
      }
      if (fractionalPackage > 0.001) {
        packagesToInsert.push(fractionalPackage);
      }

      const pricePerUnit = item.price ? parseFloat(item.price) / qty : null;

      for (const pkgQty of packagesToInsert) {
        const totalServings = pkgQty * product.servings_per_package;
        const pkgPrice = pricePerUnit ? pkgQty * pricePerUnit : null;
        
        const insertResult = await db.run(
          `INSERT INTO inventory_items (
            product_id, quantity, original_servings, remaining_servings, price, store_location, storage_location,
            purchase_date, expiration_date, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            item.product_id, pkgQty, totalServings, totalServings, pkgPrice,
            item.store_location || null, item.storage_location || 'Pantry', today, item.expiration_date || null, 'unopened'
          ]
        );
        insertedIds.push(insertResult.lastID);
      }

      // Mark list item as completed if it was a manual item (ids not prefixed with 'auto-')
      if (item.list_item_id && !String(item.list_item_id).startsWith('auto-')) {
        await db.run(
          'UPDATE shopping_list SET is_completed = 1 WHERE id = ?',
          [item.list_item_id]
        );
        completedListIds.push(item.list_item_id);
      }
    }

    if (insertedIds.length > 0 || completedListIds.length > 0) {
      await db.run(
        `INSERT INTO activity_log (action_type, description, details) VALUES (?, ?, ?)`,
        [
          'purchase_shopping_list',
          `Purchased ${items.length} shopping list item(s)`,
          JSON.stringify({
            inserted_ids: insertedIds,
            completed_list_ids: completedListIds
          })
        ]
      );
    }

    await db.run('COMMIT');
    res.json({ message: 'Purchase logged to inventory!' });
  } catch (err) {
    const db = await getDb();
    try { await db.run('ROLLBACK'); } catch (_) {}
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------
// IMAGE UPLOAD ROUTE
// ----------------------------------------------------
app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const relativePath = `uploads/${req.file.filename}`;
  res.json({ imageUrl: `/${relativePath}` });
});

// Serve frontend index.html as fallback for any non-API routes (for production bundle)
// ----------------------------------------------------
// ACTIVITY LOG ROUTES
// ----------------------------------------------------
app.get('/api/activity-log', async (req, res) => {
  try {
    const db = await getDb();
    const logs = await db.all('SELECT * FROM activity_log ORDER BY created_at DESC, id DESC LIMIT 100');
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/activity-log', async (req, res) => {
  try {
    const db = await getDb();
    await db.run('DELETE FROM activity_log');
    res.json({ message: 'Activity log cleared successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/activity-log/:id/undo', async (req, res) => {
  const logId = req.params.id;
  try {
    const db = await getDb();
    await db.run('BEGIN TRANSACTION');
    
    const log = await db.get('SELECT * FROM activity_log WHERE id = ?', [logId]);
    if (!log) {
      await db.run('ROLLBACK');
      return res.status(404).json({ error: 'Activity log not found' });
    }
    if (log.undone) {
      await db.run('ROLLBACK');
      return res.status(400).json({ error: 'This action has already been undone' });
    }
    
    const details = JSON.parse(log.details);
    
    if (log.action_type === 'make_recipe' || log.action_type === 'consume_inventory') {
      const { changed_items } = details;
      if (changed_items && changed_items.length > 0) {
        for (const item of changed_items) {
          const existing = await db.get('SELECT id FROM inventory_items WHERE id = ?', [item.id]);
          if (existing) {
            await db.run(
              `UPDATE inventory_items SET 
                remaining_servings = ?, 
                status = ?, 
                opened_date = ? 
              WHERE id = ?`,
              [item.remaining_servings, item.status, item.opened_date, item.id]
            );
          } else {
            // Restore deleted inventory item
            await db.run(
              `INSERT OR REPLACE INTO inventory_items (
                id, product_id, quantity, original_servings, remaining_servings, 
                price, store_location, storage_location, purchase_date, 
                expiration_date, opened_date, status, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                item.id, item.product_id, item.quantity, item.original_servings, 
                item.remaining_servings, item.price, item.store_location, 
                item.storage_location, item.purchase_date, item.expiration_date, 
                item.opened_date, item.status, item.created_at
              ]
            );
          }
        }
      }
    } 
    else if (log.action_type === 'add_inventory') {
      const { inserted_ids } = details;
      if (inserted_ids && inserted_ids.length > 0) {
        const placeholders = inserted_ids.map(() => '?').join(',');
        await db.run(`DELETE FROM inventory_items WHERE id IN (${placeholders})`, inserted_ids);
      }
    } 
    else if (log.action_type === 'delete_inventory') {
      const { deleted_item } = details;
      if (deleted_item) {
        await db.run(
          `INSERT OR REPLACE INTO inventory_items (
            id, product_id, quantity, original_servings, remaining_servings, 
            price, store_location, storage_location, purchase_date, 
            expiration_date, opened_date, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            deleted_item.id, deleted_item.product_id, deleted_item.quantity, 
            deleted_item.original_servings, deleted_item.remaining_servings, 
            deleted_item.price, deleted_item.store_location, deleted_item.storage_location, 
            deleted_item.purchase_date, deleted_item.expiration_date, 
            deleted_item.opened_date, deleted_item.status, deleted_item.created_at
          ]
        );
      }
    } 
    else if (log.action_type === 'update_inventory') {
      const { item_id, previous_state } = details;
      if (item_id && previous_state) {
        await db.run(
          `UPDATE inventory_items SET
            quantity = ?,
            original_servings = ?,
            remaining_servings = ?,
            status = ?,
            opened_date = ?,
            storage_location = ?,
            expiration_date = ?
          WHERE id = ?`,
          [
            previous_state.quantity,
            previous_state.original_servings,
            previous_state.remaining_servings,
            previous_state.status,
            previous_state.opened_date,
            previous_state.storage_location,
            previous_state.expiration_date,
            item_id
          ]
        );
      }
    } 
    else if (log.action_type === 'purchase_shopping_list') {
      const { inserted_ids, completed_list_ids } = details;
      
      if (inserted_ids && inserted_ids.length > 0) {
        const placeholders = inserted_ids.map(() => '?').join(',');
        await db.run(`DELETE FROM inventory_items WHERE id IN (${placeholders})`, inserted_ids);
      }
      
      if (completed_list_ids && completed_list_ids.length > 0) {
        const placeholders = completed_list_ids.map(() => '?').join(',');
        await db.run(`UPDATE shopping_list SET is_completed = 0 WHERE id IN (${placeholders})`, completed_list_ids);
      }
    }

    await db.run('UPDATE activity_log SET undone = 1 WHERE id = ?', [logId]);
    await db.run('COMMIT');
    res.json({ message: 'Action successfully undone' });
  } catch (err) {
    const db = await getDb();
    try { await db.run('ROLLBACK'); } catch (_) {}
    res.status(500).json({ error: err.message });
  }
});

// Serve frontend index.html as fallback for any non-API routes (for production bundle)
app.get('*', (req, res, next) => {
  const publicDir = path.join(__dirname, 'public');
  if (fs.existsSync(publicDir) && !req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    return res.sendFile(path.join(publicDir, 'index.html'));
  }
  next();
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
