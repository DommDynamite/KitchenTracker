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
app.use(express.json({ limit: '20mb' }));

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
// PRODUCT INHERITANCE HELPER
// ----------------------------------------------------
async function enrichProductsWithInheritedProperties(db, products) {
  if (!products) return products;
  const isArray = Array.isArray(products);
  const productsList = isArray ? products : [products];

  for (const prod of productsList) {
    if (prod.is_parent == 1) {
      // Find all child products in the registry
      const children = await db.all('SELECT * FROM products WHERE parent_product_id = ?', [prod.id]);
      if (children.length > 0) {
        const childIds = children.map(c => c.id);
        
        // Find active inventory items for these children
        const activeItems = await db.all(`
          SELECT ii.*, p.serving_size, p.serving_unit, p.servings_per_package, p.calories_per_serving, 
                 p.use_by_days_after_opening, p.default_consumption, p.image_path as product_image_path
          FROM inventory_items ii
          JOIN products p ON ii.product_id = p.id
          WHERE ii.product_id IN (${childIds.map(() => '?').join(',')}) AND ii.status IN ('unopened', 'opened')
        `, childIds);

        let source = null;

        if (activeItems.length > 0) {
          activeItems.sort((a, b) => {
            if (a.status === 'opened' && b.status !== 'opened') return -1;
            if (a.status !== 'opened' && b.status === 'opened') return 1;
            
            if (a.expiration_date && !b.expiration_date) return -1;
            if (!a.expiration_date && b.expiration_date) return 1;
            if (a.expiration_date && b.expiration_date) {
              return a.expiration_date < b.expiration_date ? -1 : a.expiration_date > b.expiration_date ? 1 : 0;
            }
            return a.purchase_date < b.purchase_date ? -1 : a.purchase_date > b.purchase_date ? 1 : 0;
          });
          source = activeItems[0];
        } else {
          source = children.find(c => (c.serving_size > 0 && c.serving_size !== 1.0) || c.calories_per_serving !== null || c.image_path) || children[0];
        }

        if (source) {
          prod.servings_per_package = source.servings_per_package;
          prod.serving_size = source.serving_size;
          prod.serving_unit = source.serving_unit;
          prod.calories_per_serving = source.calories_per_serving;
          prod.use_by_days_after_opening = source.use_by_days_after_opening;
          prod.default_consumption = source.default_consumption;

          const activeImage = source.product_image_path || source.image_path;
          if (activeImage) {
            prod.image_path = activeImage;
          }
        }
      }
    }
  }

  return isArray ? productsList : productsList[0];
}

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

  await enrichProductsWithInheritedProperties(db, products);

  const activeInventory = await db.all(`
    SELECT ii.*, p.default_unit as prod_unit, p.serving_size as prod_serving_size, 
           p.serving_unit as prod_serving_unit, p.parent_product_id, p.name as prod_name, p.brand as prod_brand, p.is_spice
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
    
    if (product.is_spice) {
      // Spice rack low stock logic
      const totalContainers = groupInventory.length;
      let isLow = false;
      let shortage = 0;
      let notes = '';
      
      const reorderThreshold = product.spice_reorder_percentage !== null && product.spice_reorder_percentage !== undefined 
        ? product.spice_reorder_percentage 
        : 20.0;
      
      if (totalContainers === 0) {
        isLow = true;
        shortage = 1.0;
        notes = `Auto-generated: Spice ${product.name} is completely out of stock.`;
      } else {
        // Find active container (opened, or oldest unopened if no opened exists)
        const activeItem = groupInventory.find(item => item.status === 'opened') || groupInventory[0];
        const activePercentage = activeItem.remaining_servings * 100;
        
        if (totalContainers === 1 && activePercentage < reorderThreshold) {
          isLow = true;
          shortage = 1.0;
          notes = `Auto-generated: Spice ${product.name} active container (${activePercentage.toFixed(0)}%) is below reorder threshold (${reorderThreshold}%).`;
        }
      }
      
      stockMap.push({
        productId: product.id,
        name: product.name,
        category: product.category,
        defaultUnit: product.default_unit,
        minimumStock: 0,
        currentStock: totalContainers,
        isLow: isLow,
        shortage: shortage,
        notes: notes
      });
    } else {
      // Standard product stock logic
      let totalInDefaultUnit = 0;

      for (const item of groupInventory) {
        // Calculate remaining servings in default units
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
    const isSpice = req.query.is_spice;
    
    let query;
    let params = [];
    let conditions = [];
    
    if (queryParent) {
      query = 'SELECT * FROM products';
      conditions.push('(parent_product_id IS NULL OR parent_product_id = "")');
    } else {
      query = `
        SELECT p1.*, p2.name as parent_name 
        FROM products p1
        LEFT JOIN products p2 ON p1.parent_product_id = p2.id
      `;
    }
    
    if (isSpice === 'true') {
      conditions.push('p1.is_spice = 1');
    } else if (isSpice === 'false') {
      conditions.push('(p1.is_spice = 0 OR p1.is_spice IS NULL)');
    } else if (isSpice !== 'all') {
      // Default to non-spice products unless 'all' is explicitly requested
      conditions.push('(p1.is_spice = 0 OR p1.is_spice IS NULL)');
    }
    
    if (req.query.parent_product_id) {
      conditions.push('p1.parent_product_id = ?');
      params.push(req.query.parent_product_id);
    }
    
    if (conditions.length > 0) {
      const cleanConditions = conditions.map(c => {
        if (queryParent) {
          return c.replace(/p1\./g, '');
        }
        return c;
      });
      query += ' WHERE ' + cleanConditions.join(' AND ');
    }
    
    query += queryParent ? ' ORDER BY name ASC' : ' ORDER BY p1.name ASC';
    
    const products = await db.all(query, params);
    await enrichProductsWithInheritedProperties(db, products);
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
    await enrichProductsWithInheritedProperties(db, product);
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

    await enrichProductsWithInheritedProperties(db, product);
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
    package_type, calories_per_serving, is_parent, is_spice, spice_reorder_percentage
  } = req.body;

  if (!name || !default_unit) {
    return res.status(400).json({ error: 'Name and default unit are required' });
  }

  const isParentVal = (is_parent === 1 || is_parent === true) ? 1 : 0;
  const parentId = isParentVal ? null : (parent_product_id || null);
  const servingsPkg = isParentVal ? 1.0 : (parseFloat(servings_per_package) || 1.0);
  const sSize = isParentVal ? 1.0 : (parseFloat(serving_size) || 1.0);
  const sUnit = isParentVal ? default_unit : (serving_unit || default_unit);
  const useByDays = isParentVal ? null : (use_by_days_after_opening !== undefined ? use_by_days_after_opening : null);
  const calPerSrv = isParentVal ? null : (calories_per_serving !== undefined ? calories_per_serving : null);

  const isSpiceVal = (is_spice === 1 || is_spice === true) ? 1 : 0;
  const spiceReorderPct = spice_reorder_percentage !== undefined ? parseFloat(spice_reorder_percentage) : 20.0;

  let finalName = name;

  try {
    const db = await getDb();
    
    if (parentId) {
      const parent = await db.get('SELECT name FROM products WHERE id = ?', [parentId]);
      if (parent) {
        finalName = brand ? `${brand.trim()} ${parent.name.trim()}` : parent.name.trim();
      }
    }

    const result = await db.run(
      `INSERT INTO products (
        name, barcode, parent_product_id, brand, category,
        default_unit, servings_per_package, serving_size, serving_unit, minimum_stock, default_consumption, use_by_days_after_opening, image_path,
        package_type, calories_per_serving, is_parent, is_spice, spice_reorder_percentage
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        finalName, barcode || null, parentId, brand || null, category || null,
        default_unit, servingsPkg, sSize, sUnit,
        minimum_stock || 0.0, default_consumption || 1.0, useByDays, image_path || null,
        package_type || 'package', calPerSrv, isParentVal, isSpiceVal, spiceReorderPct
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
    package_type, calories_per_serving, is_parent, is_spice, spice_reorder_percentage
  } = req.body;

  const isParentVal = (is_parent === 1 || is_parent === true) ? 1 : 0;
  const parentId = isParentVal ? null : (parent_product_id || null);
  const servingsPkg = isParentVal ? 1.0 : (parseFloat(servings_per_package) || 1.0);
  const sSize = isParentVal ? 1.0 : (parseFloat(serving_size) || 1.0);
  const sUnit = isParentVal ? default_unit : (serving_unit || default_unit);
  const useByDays = isParentVal ? null : (use_by_days_after_opening !== undefined ? use_by_days_after_opening : null);
  const calPerSrv = isParentVal ? null : (calories_per_serving !== undefined ? calories_per_serving : null);

  const isSpiceVal = (is_spice === 1 || is_spice === true) ? 1 : 0;
  const spiceReorderPct = spice_reorder_percentage !== undefined ? parseFloat(spice_reorder_percentage) : 20.0;

  let finalName = name;

  try {
    const db = await getDb();

    if (parentId) {
      const parent = await db.get('SELECT name FROM products WHERE id = ?', [parentId]);
      if (parent) {
        finalName = brand ? `${brand.trim()} ${parent.name.trim()}` : parent.name.trim();
      }
    }

    await db.run(
      `UPDATE products SET 
        name = ?, barcode = ?, parent_product_id = ?, brand = ?, category = ?,
        default_unit = ?, servings_per_package = ?, serving_size = ?, serving_unit = ?, minimum_stock = ?, default_consumption = ?, use_by_days_after_opening = ?, image_path = ?,
        package_type = ?, calories_per_serving = ?, is_parent = ?, is_spice = ?, spice_reorder_percentage = ?
      WHERE id = ?`,
      [
        finalName, barcode || null, parentId, brand || null, category || null,
        default_unit, servingsPkg, sSize, sUnit, minimum_stock, default_consumption || 1.0,
        useByDays, image_path, package_type || 'package', calPerSrv, isParentVal,
        isSpiceVal, spiceReorderPct,
        req.params.id
      ]
    );

    if (isParentVal) {
      // Find all child products of this parent and propagate name update
      const children = await db.all('SELECT id, brand FROM products WHERE parent_product_id = ?', [req.params.id]);
      for (const child of children) {
        const derivedName = child.brand ? `${child.brand.trim()} ${name.trim()}` : name.trim();
        await db.run('UPDATE products SET name = ? WHERE id = ?', [derivedName, child.id]);
      }
    }

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
    const isSpice = req.query.is_spice;
    
    let query = `
      SELECT ii.*, p.name as product_name, p.brand as product_brand, p.image_path as product_image,
             p.category as product_category, p.default_unit as product_unit, 
             p.servings_per_package, p.serving_size, p.serving_unit, p.default_consumption,
             p.use_by_days_after_opening, p.parent_product_id, p.is_spice
      FROM inventory_items ii
      JOIN products p ON ii.product_id = p.id
      WHERE ii.status IN ('unopened', 'opened')
    `;
    
    if (isSpice === 'true') {
      query += ' AND p.is_spice = 1';
    } else {
      query += ' AND (p.is_spice = 0 OR p.is_spice IS NULL)';
    }
    
    query += ' ORDER BY ii.expiration_date ASC, ii.purchase_date ASC';
    
    const inventory = await db.all(query);
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
      const roundedPkgQty = Math.round(pkgQty * 100) / 100;
      const totalServings = Math.round((roundedPkgQty * product.servings_per_package) * 100) / 100;
      const pkgPrice = pricePerUnit ? Math.round((roundedPkgQty * pricePerUnit) * 100) / 100 : null;

      const result = await db.run(
        `INSERT INTO inventory_items (
          product_id, quantity, original_servings, remaining_servings, price, store_location, storage_location,
          purchase_date, expiration_date, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          product_id, roundedPkgQty, totalServings, totalServings, pkgPrice, store_location || null,
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

    let nextQuantity = quantity !== undefined ? Math.round(parseFloat(quantity) * 100) / 100 : item.quantity;
    let nextOriginalServings = Math.round((nextQuantity * servingsPerPackage) * 100) / 100;
    let nextServings = remaining_servings !== undefined ? Math.round(parseFloat(remaining_servings) * 100) / 100 : item.remaining_servings;

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

    let remaining = Math.round((item.remaining_servings - servings) * 100) / 100;
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

      const deduct = Math.round(Math.min(remaining, amountRemainingToDeduct) * 100) / 100;
      const newRemainingServings = Math.round((remaining - deduct) * 100) / 100;
      
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
      amountRemainingToDeduct = Math.round((amountRemainingToDeduct - deduct) * 100) / 100;
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
// SPICE RACK ROUTES
// ----------------------------------------------------

// Get spices with active inventory levels and backups
app.get('/api/spices', async (req, res) => {
  try {
    const db = await getDb();
    
    // Fetch all parent or standalone spice products
    const parentSpices = await db.all(`
      SELECT * FROM products 
      WHERE is_spice = 1 AND (parent_product_id IS NULL OR parent_product_id = '')
      ORDER BY name ASC
    `);
    
    await enrichProductsWithInheritedProperties(db, parentSpices);
    
    const spicesList = [];
    
    for (const parent of parentSpices) {
      // Fetch all child products (specific brands) for this parent
      const childProducts = await db.all(
        'SELECT * FROM products WHERE parent_product_id = ? OR id = ?',
        [parent.id, parent.id]
      );
      await enrichProductsWithInheritedProperties(db, childProducts);
      
      const productIds = childProducts.map(p => p.id);
      
      // Fetch all active inventory items for this spice group, sorting active first
      const activeItems = await db.all(`
        SELECT ii.*, p.name as product_name, p.brand as product_brand, 
               p.serving_size as prod_serving_size, p.serving_unit as prod_serving_unit
        FROM inventory_items ii
        JOIN products p ON ii.product_id = p.id
        WHERE ii.product_id IN (${productIds.map(() => '?').join(',')}) AND ii.status IN ('unopened', 'opened')
        ORDER BY CASE WHEN ii.status = 'opened' THEN 0 ELSE 1 END ASC, ii.expiration_date ASC, ii.purchase_date ASC
      `, productIds);
      
      // Find active container (opened, or oldest unopened if no opened one exists)
      const activeItem = activeItems[0] || null;
      
      // Count backup containers (all activeItems excluding the active one)
      const totalContainers = activeItems.length;
      const backupCount = Math.max(0, totalContainers - (activeItem ? 1 : 0));
      
      let activePercentage = 0;
      if (activeItem) {
        activePercentage = Math.round(activeItem.remaining_servings * 100);
      }
      
      // Expiration: expiration of the active item
      const expirationDate = activeItem ? activeItem.expiration_date : null;
      
      spicesList.push({
        product: parent,
        brands: childProducts.filter(c => c.brand), // List of available child brands/options
        activeItem: activeItem,
        activePercentage: activePercentage,
        backupCount: backupCount,
        totalContainers: totalContainers,
        expirationDate: expirationDate
      });
    }
    
    res.json(spicesList);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update percentage left of active container, auto-rotating backups if 0%
app.put('/api/spices/:productId/percentage', async (req, res) => {
  const productId = parseInt(req.params.productId);
  const { percentage } = req.body;
  
  if (percentage === undefined || percentage === null) {
    return res.status(400).json({ error: 'percentage is required' });
  }
  
  const pct = Math.max(0, Math.min(100, parseFloat(percentage)));
  
  try {
    const db = await getDb();
    await db.run('BEGIN TRANSACTION');
    
    // Fetch all related product IDs (parent + children)
    const childProducts = await db.all(
      'SELECT id FROM products WHERE parent_product_id = ? OR id = ?',
      [productId, productId]
    );
    const productIds = childProducts.map(p => p.id);
    
    // Find active opened inventory item
    let activeItem = await db.get(`
      SELECT * FROM inventory_items 
      WHERE product_id IN (${productIds.map(() => '?').join(',')}) AND status = 'opened'
      ORDER BY expiration_date ASC, purchase_date ASC
      LIMIT 1
    `, productIds);
    
    // If no opened, find oldest unopened
    if (!activeItem) {
      activeItem = await db.get(`
        SELECT * FROM inventory_items 
        WHERE product_id IN (${productIds.map(() => '?').join(',')}) AND status = 'unopened'
        ORDER BY expiration_date ASC, purchase_date ASC
        LIMIT 1
      `, productIds);
    }
    
    const today = new Date().toISOString().split('T')[0];
    
    if (!activeItem) {
      // Create a new active item if none exists and percentage > 0
      if (pct > 0) {
        await db.run(`
          INSERT INTO inventory_items (product_id, quantity, original_servings, remaining_servings, status, purchase_date, opened_date)
          VALUES (?, 1.0, 1.0, ?, 'opened', ?, ?)
        `, [productId, pct / 100, today, today]);
      }
    } else {
      if (pct > 0) {
        // Update active item percentage
        await db.run(`
          UPDATE inventory_items 
          SET remaining_servings = ?, status = 'opened', opened_date = COALESCE(opened_date, ?)
          WHERE id = ?
        `, [pct / 100, today, activeItem.id]);
      } else {
        // Consume active item
        await db.run(`
          UPDATE inventory_items 
          SET remaining_servings = 0.0, status = 'consumed'
          WHERE id = ?
        `, [activeItem.id]);
        
        // Look for unopened backups
        const backupItem = await db.get(`
          SELECT * FROM inventory_items 
          WHERE product_id IN (${productIds.map(() => '?').join(',')}) AND status = 'unopened'
          ORDER BY expiration_date ASC, purchase_date ASC
          LIMIT 1
        `, productIds);
        
        if (backupItem) {
          // Activate backup
          await db.run(`
            UPDATE inventory_items 
            SET status = 'opened', remaining_servings = 1.0, opened_date = ?
            WHERE id = ?
          `, [today, backupItem.id]);
        }
      }
    }
    
    await db.run('COMMIT');
    res.json({ success: true, message: 'Spice percentage updated successfully' });
  } catch (err) {
    const db = await getDb();
    try { await db.run('ROLLBACK'); } catch (e) {}
    res.status(500).json({ error: err.message });
  }
});

// Quick log new jars/bottles of spice
app.post('/api/spices/quick-add', async (req, res) => {
  const { product_id, quantity, expiration_date, percentage } = req.body;
  
  if (!product_id || !quantity) {
    return res.status(400).json({ error: 'product_id and quantity are required' });
  }
  
  const qty = parseInt(quantity);
  const pct = percentage !== undefined ? Math.max(0, Math.min(100, parseFloat(percentage))) : 100.0;
  const today = new Date().toISOString().split('T')[0];
  
  try {
    const db = await getDb();
    await db.run('BEGIN TRANSACTION');
    
    // Retrieve product to check if there are any other active items
    const childProducts = await db.all(
      'SELECT id FROM products WHERE parent_product_id = ? OR id = ?',
      [product_id, product_id]
    );
    const productIds = childProducts.map(p => p.id);
    
    const hasActive = await db.get(`
      SELECT id FROM inventory_items 
      WHERE product_id IN (${productIds.map(() => '?').join(',')}) AND status = 'opened'
      LIMIT 1
    `, productIds);
    
    // Insert separate rows of 1 container each.
    for (let i = 0; i < qty; i++) {
      // If we don't have any currently active item in stock, make the first one active/opened
      const shouldBeOpened = i === 0 && !hasActive;
      const status = shouldBeOpened ? 'opened' : 'unopened';
      const rem = shouldBeOpened ? pct / 100 : 1.0;
      const openedDate = status === 'opened' ? today : null;
      
      await db.run(`
        INSERT INTO inventory_items (product_id, quantity, original_servings, remaining_servings, status, purchase_date, expiration_date, opened_date)
        VALUES (?, 1.0, 1.0, ?, ?, ?, ?, ?)
      `, [product_id, rem, status, today, expiration_date || null, openedDate]);
    }
    
    await db.run('COMMIT');
    res.json({ success: true, message: 'Spice containers logged successfully' });
  } catch (err) {
    const db = await getDb();
    try { await db.run('ROLLBACK'); } catch (e) {}
    res.status(500).json({ error: err.message });
  }
});

// Delete a specific spice container from active inventory
app.delete('/api/spices/inventory/:itemId', async (req, res) => {
  const itemId = parseInt(req.params.itemId);
  try {
    const db = await getDb();
    await db.run('DELETE FROM inventory_items WHERE id = ?', [itemId]);
    res.json({ success: true, message: 'Spice container deleted successfully' });
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
// SETTINGS ROUTES
// ----------------------------------------------------

// Get all settings
app.get('/api/settings', async (req, res) => {
  try {
    const db = await getDb();
    const rows = await db.all('SELECT key, value FROM app_settings');
    const settings = {};
    for (const row of rows) {
      if (row.key === 'gemini_api_key' && row.value) {
        settings[row.key] = 'REDACTED';
      } else if (row.key === 'receipt_scanning_enabled') {
        settings[row.key] = row.value === 'true';
      } else {
        settings[row.key] = row.value;
      }
    }
    if (settings.receipt_scanning_enabled === undefined) {
      settings.receipt_scanning_enabled = false;
    }
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update a setting
app.post('/api/settings', async (req, res) => {
  const { key, value } = req.body;
  if (!key) {
    return res.status(400).json({ error: 'key is required' });
  }
  try {
    const db = await getDb();
    if (key === 'gemini_api_key' && value === 'REDACTED') {
      return res.json({ message: 'Settings unchanged' });
    }
    const stringValue = typeof value === 'boolean' ? String(value) : value;
    await db.run(
      'INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)',
      [key, stringValue]
    );
    res.json({ message: 'Setting updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get ignored items
app.get('/api/settings/ignored', async (req, res) => {
  try {
    const db = await getDb();
    const items = await db.all('SELECT * FROM receipt_ignored_items ORDER BY created_at DESC');
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete an ignored item
app.delete('/api/settings/ignored/:id', async (req, res) => {
  try {
    const db = await getDb();
    await db.run('DELETE FROM receipt_ignored_items WHERE id = ?', [req.params.id]);
    res.json({ message: 'Ignored item deleted successfully' });
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
      if (ing.product_id) {
        recipeIngredientsMap[ing.recipe_id].push(ing.product_id);
      }
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
    
    // Fetch recipe ingredients
    const ingredients = await db.all(`
      SELECT ri.*
      FROM recipe_ingredients ri
      WHERE ri.recipe_id = ?
    `, [recipe.id]);

    if (ingredients.length > 0) {
      const productIds = ingredients.filter(i => i.product_id).map(i => i.product_id);
      if (productIds.length > 0) {
        const referencedProducts = await db.all(`
          SELECT * FROM products WHERE id IN (${productIds.map(() => '?').join(',')})
        `, productIds);

        await enrichProductsWithInheritedProperties(db, referencedProducts);

        // Fetch active inventory items for referenced products and their children to resolve spice details
        const activeInventoryItems = await db.all(`
          SELECT ii.*, p.parent_product_id
          FROM inventory_items ii
          JOIN products p ON ii.product_id = p.id
          WHERE (ii.product_id IN (${productIds.map(() => '?').join(',')}) 
                 OR p.parent_product_id IN (${productIds.map(() => '?').join(',')}))
                AND ii.status IN ('unopened', 'opened')
        `, [...productIds, ...productIds]);

        // Map back to ingredients
        ingredients.forEach(ing => {
          if (ing.product_id) {
            const p = referencedProducts.find(prod => prod.id === ing.product_id);
            if (p) {
              ing.product_name = p.name;
              ing.prod_unit = p.default_unit;
              ing.prod_serving_size = p.serving_size;
              ing.prod_serving_unit = p.serving_unit;
              ing.parent_product_id = p.parent_product_id;
              ing.calories_per_serving = p.calories_per_serving;
              ing.servings_per_package = p.servings_per_package;
              ing.package_type = p.package_type;
              ing.is_spice = p.is_spice;
              ing.spice_reorder_percentage = p.spice_reorder_percentage;

              if (p.is_spice) {
                // Find all active inventory items belonging to this spice product or child brands
                const spiceItems = activeInventoryItems.filter(item => 
                  item.product_id === ing.product_id || item.parent_product_id === ing.product_id
                );
                
                // Sort active first
                const sortedSpices = spiceItems.sort((a, b) => {
                  if (a.status === 'opened' && b.status !== 'opened') return -1;
                  if (a.status !== 'opened' && b.status === 'opened') return 1;
                  return new Date(a.expiration_date || '') - new Date(b.expiration_date || '');
                });
                
                const activeItem = sortedSpices[0] || null;
                ing.activePercentage = activeItem ? Math.round(activeItem.remaining_servings * 100) : 0;
                ing.totalContainers = sortedSpices.length;
              }
            }
          } else {
            ing.product_name = ing.name || 'Unlinked Ingredient';
          }
        });
      } else {
        ingredients.forEach(ing => {
          ing.product_name = ing.name || 'Unlinked Ingredient';
        });
      }
    }

    let totalCalories = 0;

    // Check stock for each ingredient
    const stockLevels = await getStockLevels();
    const enrichedIngredients = ingredients.map(ing => {
      if (ing.product_id) {
        // Build dummy product object for unit converter
        const productForConv = {
          serving_size: ing.prod_serving_size,
          serving_unit: ing.prod_serving_unit,
          default_unit: ing.prod_unit,
          servings_per_package: ing.servings_per_package,
          package_type: ing.package_type
        };

        if (ing.is_spice) {
          // Spice stock availability logic
          return {
            ...ing,
            inStock: ing.totalContainers > 0,
            availableAmount: ing.totalContainers,
            requiredInProdUnit: 1.0 // represented as containers count
          };
        }

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
      } else {
        // Unlinked ingredient
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
        'INSERT INTO recipe_ingredients (recipe_id, product_id, amount, unit, name) VALUES (?, ?, ?, ?, ?)',
        [recipeId, ing.product_id || null, ing.amount, ing.unit, ing.name || null]
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
        'INSERT INTO recipe_ingredients (recipe_id, product_id, amount, unit, name) VALUES (?, ?, ?, ?, ?)',
        [id, ing.product_id || null, ing.amount, ing.unit, ing.name || null]
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
          SELECT id, name as product_name, default_unit as prod_unit, serving_size as prod_serving_size, 
                 serving_unit as prod_serving_unit, parent_product_id, is_parent, package_type, servings_per_package
          FROM products WHERE id = ?
        `, [customIng.product_id]);
        if (product) {
          const prodObj = {
            id: product.id,
            name: product.product_name,
            is_parent: product.is_parent,
            default_unit: product.prod_unit,
            serving_size: product.prod_serving_size,
            serving_unit: product.prod_serving_unit,
            parent_product_id: product.parent_product_id,
            package_type: product.package_type,
            servings_per_package: product.servings_per_package
          };
          await enrichProductsWithInheritedProperties(db, prodObj);
          ingredients.push({
            product_id: customIng.product_id,
            amount: parseFloat(customIng.amount),
            unit: customIng.unit,
            product_name: prodObj.name,
            prod_unit: prodObj.default_unit,
            prod_serving_size: prodObj.serving_size,
            prod_serving_unit: prodObj.serving_unit,
            parent_product_id: prodObj.parent_product_id,
            package_type: prodObj.package_type,
            servings_per_package: prodObj.servings_per_package
          });
        }
      }
    } else {
      // Fetch recipe ingredients
      const rawIngredients = await db.all(`
        SELECT ri.*, p.name as product_name, p.default_unit as prod_unit, p.serving_size as prod_serving_size, 
               p.serving_unit as prod_serving_unit, p.parent_product_id, p.is_parent, p.package_type, p.servings_per_package
        FROM recipe_ingredients ri
        JOIN products p ON ri.product_id = p.id
        WHERE ri.recipe_id = ?
      `, [req.params.id]);

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
        await enrichProductsWithInheritedProperties(db, prodObj);
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
    }

    const changedItems = [];
    await db.run('BEGIN TRANSACTION');

    for (const ing of ingredients) {
      const ingredientProduct = {
        serving_size: ing.prod_serving_size,
        serving_unit: ing.prod_serving_unit,
        default_unit: ing.prod_unit,
        parent_product_id: ing.parent_product_id,
        servings_per_package: ing.servings_per_package,
        package_type: ing.package_type
      };

      // Find matching products: either the product itself, or if it is a parent product, its children too.
      const productsGroup = await db.all(`
        SELECT id, serving_size, serving_unit, default_unit, servings_per_package, package_type, is_parent, parent_product_id FROM products 
        WHERE parent_product_id = ? OR id = ?
      `, [ing.product_id, ing.product_id]);
      await enrichProductsWithInheritedProperties(db, productsGroup);
      
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

      let amountRemainingToDeduct = Math.round(totalAmountNeededInProdUnit * 100) / 100;

      for (const item of inventoryItems) {
        if (amountRemainingToDeduct <= 0) break;

        const itemProduct = productsGroup.find(p => Number(p.id) === Number(item.product_id)) || {};
        const itemServingSize = itemProduct.serving_size || 1.0;
        const itemServingUnit = itemProduct.serving_unit || itemProduct.default_unit;

        // How much default unit is left in this item?
        // remaining_servings * serving_size (in serving_unit) = amount in serving_unit
        const remainingInServingUnit = item.remaining_servings * itemServingSize;
        const remainingInProdUnit = convertUnit(remainingInServingUnit, itemServingUnit, ing.prod_unit, itemProduct);

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

          let newRemainingServings = Math.round((item.remaining_servings - deductServings) * 100) / 100;
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

          amountRemainingToDeduct = Math.round((amountRemainingToDeduct - remainingInProdUnit) * 100) / 100;
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
      let product = await db.get('SELECT * FROM products WHERE id = ?', [item.product_id]);
      if (!product) continue;
      await enrichProductsWithInheritedProperties(db, product);

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
        const roundedPkgQty = Math.round(pkgQty * 100) / 100;
        const totalServings = Math.round((roundedPkgQty * product.servings_per_package) * 100) / 100;
        const pkgPrice = pricePerUnit ? Math.round((roundedPkgQty * pricePerUnit) * 100) / 100 : null;
        
        const insertResult = await db.run(
          `INSERT INTO inventory_items (
            product_id, quantity, original_servings, remaining_servings, price, store_location, storage_location,
            purchase_date, expiration_date, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            item.product_id, roundedPkgQty, totalServings, totalServings, pkgPrice,
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
// RECEIPT SCANNING ROUTES
// ----------------------------------------------------

app.post('/api/receipts/scan', async (req, res) => {
  const { image } = req.body;
  if (!image) {
    return res.status(400).json({ error: 'Image data is required' });
  }

  try {
    const db = await getDb();
    
    // Check if enabled and get key
    const enabledSetting = await db.get("SELECT value FROM app_settings WHERE key = 'receipt_scanning_enabled'");
    if (!enabledSetting || enabledSetting.value !== 'true') {
      return res.status(400).json({ error: 'Receipt scanning is disabled in settings.' });
    }

    const keySetting = await db.get("SELECT value FROM app_settings WHERE key = 'gemini_api_key'");
    if (!keySetting || !keySetting.value) {
      return res.status(400).json({ error: 'Gemini API key is not configured.' });
    }
    const apiKey = keySetting.value;

    const products = await db.all("SELECT id, name, brand, category FROM products");
    const mappings = await db.all("SELECT raw_description, product_id FROM receipt_item_mappings");
    const ignoredItems = await db.all("SELECT raw_description FROM receipt_ignored_items");
    const ignoredSet = new Set(ignoredItems.map(i => i.raw_description.toLowerCase().trim()));

    let base64Data = image;
    let mimeType = 'image/jpeg';

    if (image.startsWith('data:')) {
      const match = image.match(/^data:([^;]+);base64,(.*)$/);
      if (match) {
        mimeType = match[1];
        base64Data = match[2];
      }
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Analyze this grocery receipt image. OCR and parse the list of items purchased.
For each item, extract:
- 'raw_description': The text description exactly as printed on the receipt.
- 'expanded_description': Expand abbreviations to make it human-readable (e.g., "ORG WHL MLK 0.5G" -> "Organic Whole Milk 0.5 Gallon").
- 'quantity': The number of items purchased (default to 1).
- 'price': The total price paid for this item (as a float).
- 'matched_product_id': Find the closest matching product ID from the registered products database list below.
  * Be flexible: Match variations in names, brands, or sizes (e.g., "GV MILK" or "WHL MLK" should match "Great Value Whole Milk 1 Gal" or "Whole Milk").
  * Brand association: Match brand abbreviations (e.g., "GV" -> "Great Value", "OV" -> "Organic Valley", "MSN" or "MS" -> "Mission").
  * Use the historical user mappings list below as a strong lookup map: if the raw description matches a historical mapping's raw description, map it to the corresponding product_id.
  * If no registered product resembles this item, set matched_product_id to null.
- 'confidence': A decimal value between 0.0 and 1.0 representing how confident you are in both the OCR extraction AND the product match.
  * A clear, unambiguous product match should have confidence >= 0.85.
  * A fuzzy/guessed match should have confidence between 0.50 and 0.80.
  * A raw item with no matching database product (matched_product_id = null) should have its OCR confidence (typically 0.80 to 1.00 depending on image legibility).
  * Never default to 0.0 unless the text is completely unreadable.

Here is the database of registered products:
${JSON.stringify(products.map(p => ({ id: p.id, name: p.name, brand: p.brand || '', category: p.category || '' })))}

Here are historical user mappings to assist your matches:
${JSON.stringify(mappings.map(m => ({ raw: m.raw_description, product_id: m.product_id })))}

Return a strictly formatted JSON array matching this schema:
[
  {
    "raw_description": "text",
    "expanded_description": "text",
    "quantity": number,
    "price": number,
    "matched_product_id": number or null,
    "confidence": number
  }
]`
                },
                {
                  inlineData: {
                    mimeType: mimeType,
                    data: base64Data
                  }
                }
              ]
            }
          ],
          generationConfig: {
            responseMimeType: 'application/json'
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API Error:', errorText);
      return res.status(response.status).json({ error: `Gemini API returned error: ${response.statusText}` });
    }

    const resultData = await response.json();
    const candidateText = resultData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
      throw new Error('Invalid response from Gemini API');
    }

    let items = JSON.parse(candidateText.trim());
    items = items.map(item => {
      const rawLower = (item.raw_description || '').toLowerCase().trim();
      return {
        ...item,
        ignored: ignoredSet.has(rawLower)
      };
    });

    res.json(items);
  } catch (err) {
    console.error('Receipt parse failed:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/receipts/log', async (req, res) => {
  const { items, ignoredRawDescriptions } = req.body;
  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ error: 'items array is required' });
  }

  try {
    const db = await getDb();
    await db.run('BEGIN TRANSACTION');

    const today = new Date().toISOString().split('T')[0];
    const insertedIds = [];

    for (const item of items) {
      if (item.ignored || !item.product_id) continue;

      let product = await db.get('SELECT * FROM products WHERE id = ?', [item.product_id]);
      if (!product) continue;
      await enrichProductsWithInheritedProperties(db, product);

      const qty = parseFloat(item.quantity) || 1.0;
      const servingsPerPackage = product.servings_per_package || 1.0;
      const totalServings = Math.round((qty * servingsPerPackage) * 100) / 100;
      const pricePerPackage = item.price ? Math.round((parseFloat(item.price) / qty) * 100) / 100 : null;

      const insertResult = await db.run(
        `INSERT INTO inventory_items (
          product_id, quantity, original_servings, remaining_servings, price, store_location, storage_location,
          purchase_date, expiration_date, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.product_id, qty, totalServings, totalServings, pricePerPackage,
          item.store_location || null, item.storage_location || 'Pantry', today, item.expiration_date || null, 'unopened'
        ]
      );
      insertedIds.push(insertResult.lastID);

      if (item.raw_description) {
        await db.run(
          `INSERT OR REPLACE INTO receipt_item_mappings (raw_description, product_id) VALUES (?, ?)`,
          [item.raw_description.trim(), item.product_id]
        );
      }
    }

    if (ignoredRawDescriptions && Array.isArray(ignoredRawDescriptions)) {
      for (const desc of ignoredRawDescriptions) {
        if (desc) {
          await db.run(
            `INSERT OR IGNORE INTO receipt_ignored_items (raw_description) VALUES (?)`,
            [desc.trim()]
          );
        }
      }
    }

    if (insertedIds.length > 0) {
      await db.run(
        `INSERT INTO activity_log (action_type, description, details) VALUES (?, ?, ?)`,
        [
          'purchase_shopping_list',
          `Processed receipt purchases: logged ${insertedIds.length} items to inventory`,
          JSON.stringify({
            inserted_ids: insertedIds,
            completed_list_ids: []
          })
        ]
      );
    }

    await db.run('COMMIT');
    res.json({ message: 'Receipt purchases logged successfully!', insertedIds });
  } catch (err) {
    const db = await getDb();
    try { await db.run('ROLLBACK'); } catch (_) {}
    console.error('Error logging receipt purchases:', err);
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

// --- GEMINI CULINARY ASSISTANT CHAT ROUTES ---

// GET /api/gemini/chats - Fetch saved chats
app.get('/api/gemini/chats', async (req, res) => {
  const { recipe_id } = req.query;
  try {
    const db = await getDb();
    let chats;
    if (recipe_id) {
      chats = await db.all('SELECT * FROM recipe_chats WHERE recipe_id = ? ORDER BY updated_at DESC', [recipe_id]);
    } else {
      chats = await db.all('SELECT * FROM recipe_chats WHERE recipe_id IS NULL ORDER BY updated_at DESC');
    }
    res.json(chats.map(c => ({
      ...c,
      messages: JSON.parse(c.messages || '[]')
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/gemini/chats - Create a new chat
app.post('/api/gemini/chats', async (req, res) => {
  const { recipe_id, title } = req.body;
  try {
    const db = await getDb();
    const chatTitle = title || (recipe_id ? `Recipe Chat` : `New Culinary Chat`);
    const result = await db.run(
      'INSERT INTO recipe_chats (recipe_id, title, messages) VALUES (?, ?, ?)',
      [recipe_id || null, chatTitle, '[]']
    );
    res.status(201).json({
      id: result.lastID,
      recipe_id: recipe_id || null,
      title: chatTitle,
      messages: []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/gemini/chats/:id - Delete a chat
app.delete('/api/gemini/chats/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await getDb();
    await db.run('DELETE FROM recipe_chats WHERE id = ?', [id]);
    res.sendStatus(204);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/gemini/chats/:id/message - Chat with Gemini
app.post('/api/gemini/chats/:id/message', async (req, res) => {
  const { id } = req.params;
  const { message } = req.body;

  if (!message || message.trim() === '') {
    return res.status(400).json({ error: 'Message cannot be empty' });
  }

  try {
    const db = await getDb();
    
    // Fetch chat history
    const chat = await db.get('SELECT * FROM recipe_chats WHERE id = ?', [id]);
    if (!chat) {
      return res.status(404).json({ error: 'Chat session not found' });
    }
    const messages = JSON.parse(chat.messages || '[]');

    // Get API Key
    const keySetting = await db.get("SELECT value FROM app_settings WHERE key = 'gemini_api_key'");
    const apiKey = keySetting ? keySetting.value : '';
    if (!apiKey) {
      return res.status(400).json({ error: 'Gemini API Key is not configured. Please go to Settings to add your key.' });
    }

    // Fetch current in-stock inventory context
    const inventory = await db.all(`
      SELECT ii.remaining_servings, p.name as product_name, p.brand as product_brand, p.serving_unit
      FROM inventory_items ii
      JOIN products p ON ii.product_id = p.id
      WHERE ii.status IN ('unopened', 'opened')
    `);

    // Group inventory to avoid duplicate list items
    const inventoryMap = {};
    for (const item of inventory) {
      const key = `${item.product_name} (${item.product_brand || 'No Brand'})`;
      if (!inventoryMap[key]) {
        inventoryMap[key] = { amount: 0, unit: item.serving_unit || 'pieces' };
      }
      inventoryMap[key].amount += item.remaining_servings;
    }
    const inventoryListStr = Object.entries(inventoryMap)
      .map(([name, data]) => `- ${name}: ${data.amount.toFixed(1)} ${data.unit}`)
      .join('\n');

    // Fetch recipe context if active
    let recipeContextStr = '';
    if (chat.recipe_id) {
      const recipe = await db.get('SELECT * FROM recipes WHERE id = ?', [chat.recipe_id]);
      if (recipe) {
        const recipeIngredients = await db.all(`
          SELECT ri.amount, ri.unit, ri.name as ingredient_name, p.name as product_name
          FROM recipe_ingredients ri
          LEFT JOIN products p ON ri.product_id = p.id
          WHERE ri.recipe_id = ?
        `, [chat.recipe_id]);
        const recipeSteps = await db.all('SELECT * FROM recipe_steps WHERE recipe_id = ? ORDER BY step_number ASC', [chat.recipe_id]);
        const recipeEquipment = await db.all('SELECT * FROM recipe_equipment WHERE recipe_id = ? ORDER BY name ASC', [chat.recipe_id]);

        recipeContextStr = `
The user is currently viewing/discussing this recipe in their library:
- Name: ${recipe.name}
- Description: ${recipe.description || 'No description provided'}
- Servings: ${recipe.servings}
- Ingredients Needed:
${recipeIngredients.map(ing => `  * ${ing.amount} ${ing.unit} ${ing.product_name || ing.ingredient_name}`).join('\n')}
- Steps:
${recipeSteps.map(s => `  ${s.step_number}. ${s.instruction}`).join('\n')}
- Equipment:
${recipeEquipment.map(e => `  * ${e.name}`).join('\n')}
`;
      }
    }

    // Build the system prompt instruction
    const systemPrompt = `You are Gemini, a helpful culinary assistant in "My Kitchen App".
You assist the user in managing inventory, adapting recipes, suggesting new creations, and scaling quantities.

Here is the user's active inventory (items currently in stock):
${inventoryListStr || 'No items in stock.'}
${recipeContextStr}
GUIDELINES:
1. Always be conversational, friendly, and helpful.
2. Cross-reference the user's inventory when suggesting recipes or answer questions about what they can make. Let them know if they have ingredients or are missing something.
3. If you suggest a recipe that the user might want to add to their library, you MUST format the recipe details inside a structured JSON code block. This code block must start with \`\`\`json and end with \`\`\`.
The JSON block MUST follow this exact schema:
{
  "name": "Recipe Name",
  "description": "Recipe summary/description",
  "servings": number,
  "equipment": ["Equipment 1", "Equipment 2"],
  "ingredients": [
    { "name": "Ingredient name (e.g. Garlic Powder)", "amount": number, "unit": "pieces|g|kg|ml|l|cup|tbsp|tsp|etc" }
  ],
  "steps": [
    "Step 1 instruction text",
    "Step 2 instruction text"
  ]
}
4. When suggesting recipes, output the conversation text first, then end with the JSON code block. The frontend will detect this JSON block and render an "Import Recipe" button automatically.`;

    // Append user message
    messages.push({ role: 'user', content: message });

    // Format chat history for Gemini API
    const contents = messages.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          systemInstruction: {
            parts: [{ text: systemPrompt }]
          }
        })
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errText}`);
    }

    const resData = await response.json();
    const reply = resData.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Append response to history
    messages.push({ role: 'model', content: reply });

    // Save updated history in the database
    await db.run(
      'UPDATE recipe_chats SET messages = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [JSON.stringify(messages), id]
    );

    res.json(messages);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/recipes/import-resolve - Resolve recipe import ingredients
app.post('/api/recipes/import-resolve', async (req, res) => {
  const { name, description, servings, equipment, ingredients, steps } = req.body;
  try {
    const db = await getDb();
    
    // Resolve ingredients
    const resolvedIngredients = [];
    if (ingredients && ingredients.length > 0) {
      for (const ing of ingredients) {
        // Attempt exact or case-insensitive match on product name
        const match = await db.get(
          'SELECT id, name FROM products WHERE LOWER(name) = ? LIMIT 1',
          [(ing.name || '').toLowerCase().trim()]
        );
        if (match) {
          resolvedIngredients.push({
            product_id: match.id,
            name: match.name,
            amount: ing.amount || 1,
            unit: ing.unit || 'pieces',
            isUnlinked: false
          });
        } else {
          // If no product is found, it is an unlinked ingredient
          resolvedIngredients.push({
            product_id: '',
            name: ing.name,
            amount: ing.amount || 1,
            unit: ing.unit || 'pieces',
            isUnlinked: true
          });
        }
      }
    }

    // Resolve steps into format expected by add modal
    const resolvedSteps = (steps || []).map(s => {
      if (typeof s === 'string') {
        return { instruction: s, image_path: '' };
      }
      return { instruction: s.instruction || '', image_path: s.image_path || '' };
    });

    res.json({
      name: name || '',
      description: description || '',
      servings: servings || 2,
      equipment: equipment || [''],
      ingredients: resolvedIngredients.length > 0 ? resolvedIngredients : [{ product_id: '', name: '', amount: '', unit: 'pieces', isUnlinked: false }],
      steps: resolvedSteps.length > 0 ? resolvedSteps : [{ instruction: '', image_path: '' }]
    });
  } catch (err) {
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
