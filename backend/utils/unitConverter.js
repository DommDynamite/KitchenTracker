// Standard conversion rates to base units (g for mass, ml for volume)
const MASS_TO_G = {
  g: 1,
  kg: 1000,
  oz: 28.3495231,
  lb: 453.59237
};

const VOLUME_TO_ML = {
  ml: 1,
  l: 1000,
  fl_oz: 29.5735296,
  cup: 236.588236,
  pint: 473.176473,
  quart: 946.352946,
  gallon: 3785.41178
};

// Normalize unit strings to standard abbreviations
export function normalizeUnit(unit) {
  if (!unit) return 'pieces';
  const u = unit.toLowerCase().trim();
  
  // Normalize variations
  if (u === '%' || u === 'percent' || u === 'percentage') return '%';
  if (u === 'piece' || u === 'pieces' || u === 'pc' || u === 'pcs' || u === 'each') return 'pieces';
  if (u === 'serving' || u === 'servings' || u === 'srv') return 'servings';
  if (u === 'gram' || u === 'grams' || u === 'g') return 'g';
  if (u === 'kilogram' || u === 'kilograms' || u === 'kg') return 'kg';
  if (u === 'ounce' || u === 'ounces' || u === 'oz') return 'oz';
  if (u === 'pound' || u === 'pounds' || u === 'lb' || u === 'lbs') return 'lb';
  if (u === 'milliliter' || u === 'milliliters' || u === 'ml') return 'ml';
  if (u === 'liter' || u === 'liters' || u === 'l') return 'l';
  if (u === 'fluid ounce' || u === 'fluid ounces' || u === 'fl oz' || u === 'fl_oz' || u === 'floz') return 'fl_oz';
  if (u === 'cup' || u === 'cups' || u === 'c') return 'cup';
  if (u === 'pint' || u === 'pints' || u === 'pt') return 'pint';
  if (u === 'quart' || u === 'quarts' || u === 'qt') return 'quart';
  if (u === 'gallon' || u === 'gallons' || u === 'gal') return 'gallon';
  
  // Package units normalization
  if (u === 'bag' || u === 'bags') return 'bags';
  if (u === 'box' || u === 'boxes') return 'boxes';
  if (u === 'bottle' || u === 'bottles') return 'bottles';
  if (u === 'can' || u === 'cans') return 'cans';
  if (u === 'carton' || u === 'cartons') return 'cartons';
  if (u === 'pack' || u === 'packs') return 'packs';
  if (u === 'tub' || u === 'tubs') return 'tubs';
  if (u === 'jar' || u === 'jars') return 'jars';
  if (u === 'tin' || u === 'tins') return 'tins';
  if (u === 'pouch' || u === 'pouches') return 'pouches';
  if (u === 'roll' || u === 'rolls') return 'rolls';
  if (u === 'container' || u === 'containers') return 'containers';
  if (u === 'package' || u === 'packages' || u === 'pkg' || u === 'pkgs') return 'packages';
  
  return u;
}

/**
 * Converts a given amount of an ingredient/product from one unit to another.
 * Handles:
 *  - Mass to Mass
 *  - Volume to Volume
 *  - Mass/Volume to Servings (using product's serving_size and serving_unit)
 *  - Servings to Mass/Volume (using product's serving_size and serving_unit)
 *  - Fallbacks (e.g. density conversion between mass & volume)
 * 
 * @param {number} amount - The numeric amount to convert
 * @param {string} fromUnit - The unit of the amount
 * @param {string} toUnit - The unit to convert into
 * @param {object} product - Product database record { serving_size, serving_unit, default_unit, servings_per_package, package_type }
 * @returns {number} The converted amount
 */
export function convertUnit(amount, fromUnit, toUnit, product = {}) {
  const normalizedFrom = normalizeUnit(fromUnit);
  const normalizedTo = normalizeUnit(toUnit);

  if (normalizedFrom === normalizedTo) {
    return amount;
  }

  const servingsPerPackage = product.servings_per_package || 1.0;

  // Convert FROM percentage unit to anything else
  if (normalizedFrom === '%' && normalizedTo !== '%') {
    const servings = (amount / 100) * servingsPerPackage;
    return convertUnit(servings, 'servings', normalizedTo, product);
  }

  // Convert TO percentage unit from anything else
  if (normalizedTo === '%' && normalizedFrom !== '%') {
    const servings = convertUnit(amount, normalizedFrom, 'servings', product);
    return (servings / servingsPerPackage) * 100;
  }
  
  const PACKAGE_UNITS = new Set([
    'packages', 'bags', 'boxes', 'bottles', 'cans', 'cartons', 
    'packs', 'tubs', 'jars', 'tins', 'pouches', 'rolls', 'containers'
  ]);
  
  const isPackageUnit = (u, prod) => {
    return PACKAGE_UNITS.has(u) || (prod && prod.package_type && u === normalizeUnit(prod.package_type));
  };

  // Convert FROM package unit
  if (isPackageUnit(normalizedFrom, product)) {
    const servings = amount * servingsPerPackage;
    return convertUnit(servings, 'servings', normalizedTo, product);
  }

  // Convert TO package unit
  if (isPackageUnit(normalizedTo, product)) {
    const servings = convertUnit(amount, normalizedFrom, 'servings', product);
    return servings / servingsPerPackage;
  }

  // 1. Determine unit categories
  const isFromMass = normalizedFrom in MASS_TO_G;
  const isToMass = normalizedTo in MASS_TO_G;
  
  const isFromVolume = normalizedFrom in VOLUME_TO_ML;
  const isToVolume = normalizedTo in VOLUME_TO_ML;

  const isFromCount = normalizedFrom === 'pieces';
  const isToCount = normalizedTo === 'pieces';

  const isFromServings = normalizedFrom === 'servings';
  const isToServings = normalizedTo === 'servings';

  // Helper product settings
  const servingSize = product.serving_size || 1.0;
  const servingUnit = normalizeUnit(product.serving_unit || product.default_unit || 'pieces');

  // Helper to convert within dimensions
  const convertMass = (val, from, to) => {
    const valInG = val * MASS_TO_G[from];
    return valInG / MASS_TO_G[to];
  };

  const convertVolume = (val, from, to) => {
    const valInMl = val * VOLUME_TO_ML[from];
    return valInMl / VOLUME_TO_ML[to];
  };

  // Scenario A: Mass to Mass
  if (isFromMass && isToMass) {
    return convertMass(amount, normalizedFrom, normalizedTo);
  }

  // Scenario B: Volume to Volume
  if (isFromVolume && isToVolume) {
    return convertVolume(amount, normalizedFrom, normalizedTo);
  }

  // Scenario C: Servings to standard units (or vice versa)
  if (isFromServings) {
    if (servingUnit === 'servings') {
      return amount; // Avoid infinite recursion
    }
    // 1 serving = servingSize * servingUnit
    // e.g. 2 servings of Milk -> 2 * 240 ml = 480 ml
    const totalInServingUnit = amount * servingSize;
    return convertUnit(totalInServingUnit, servingUnit, normalizedTo, product);
  }

  if (isToServings) {
    if (servingUnit === 'servings') {
      return amount; // Avoid infinite recursion
    }
    // Convert current amount to the product's serving_unit first, then divide by serving_size
    // e.g. 480 ml of Milk -> convert to ml (480) -> divide by 240 ml = 2 servings
    const amountInServingUnit = convertUnit(amount, normalizedFrom, servingUnit, product);
    return amountInServingUnit / servingSize;
  }

  // Scenario D: Pieces/Count to Servings (Assume 1 piece = 1 serving if not specified)
  if (isFromCount && isToServings) {
    // e.g. 1 egg (pieces) to servings -> if serving_unit is 'pieces', convert.
    // Otherwise assume 1 piece = 1 serving.
    if (servingUnit === 'pieces') {
      return (amount * 1) / servingSize;
    }
    return amount;
  }

  if (isFromServings && isToCount) {
    if (servingUnit === 'pieces') {
      return amount * servingSize;
    }
    return amount;
  }

  // Scenario E: Density fallback (converting between Mass and Volume)
  // We assume 1g = 1ml (density of water) as standard fallback
  if (isFromMass && isToVolume) {
    const amountInG = amount * MASS_TO_G[normalizedFrom];
    const amountInMl = amountInG; // 1g = 1ml
    return convertVolume(amountInMl, 'ml', normalizedTo);
  }

  if (isFromVolume && isToMass) {
    const amountInMl = amount * VOLUME_TO_ML[normalizedFrom];
    const amountInG = amountInMl; // 1ml = 1g
    return convertMass(amountInG, 'g', normalizedTo);
  }

  // Final fallback (no direct conversion matches, e.g. piece to gram with no conversion info)
  // Just return the amount to avoid crashes
  return amount;
}
