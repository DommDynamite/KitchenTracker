import { describe, it, expect } from 'vitest';
import { normalizeUnit, formatStock, formatStockCompact } from '../../pages/Inventory';

describe('Unit Converter & Stock Formatter Utilities', () => {
  describe('normalizeUnit', () => {
    it('normalizes various unit names correctly', () => {
      expect(normalizeUnit('grams')).toBe('g');
      expect(normalizeUnit('Gram')).toBe('g');
      expect(normalizeUnit('g')).toBe('g');
      
      expect(normalizeUnit('kilograms')).toBe('kg');
      expect(normalizeUnit('KG')).toBe('kg');
      
      expect(normalizeUnit('ounce')).toBe('oz');
      expect(normalizeUnit('ounces')).toBe('oz');
      expect(normalizeUnit('oz')).toBe('oz');
      
      expect(normalizeUnit('pounds')).toBe('lb');
      expect(normalizeUnit('Lbs')).toBe('lb');
      expect(normalizeUnit('lb')).toBe('lb');
      
      expect(normalizeUnit('milliliter')).toBe('ml');
      expect(normalizeUnit('ML')).toBe('ml');
      
      expect(normalizeUnit('liters')).toBe('l');
      expect(normalizeUnit('L')).toBe('l');

      expect(normalizeUnit('fluid ounces')).toBe('fl_oz');
      expect(normalizeUnit('fl oz')).toBe('fl_oz');
      expect(normalizeUnit('fl_oz')).toBe('fl_oz');

      expect(normalizeUnit('cups')).toBe('cup');
      expect(normalizeUnit('cup')).toBe('cup');

      expect(normalizeUnit('tablespoon')).toBe('tbsp');
      expect(normalizeUnit('tbsp')).toBe('tbsp');
      
      expect(normalizeUnit('teaspoon')).toBe('tsp');
      expect(normalizeUnit('tsp')).toBe('tsp');

      expect(normalizeUnit('pieces')).toBe('pieces');
      expect(normalizeUnit(null)).toBe('');
      expect(normalizeUnit(undefined)).toBe('');
    });
  });

  describe('formatStock', () => {
    it('formats percentage stock correctly', () => {
      expect(formatStock(75, 100, '%')).toBe('75%');
      expect(formatStock(100, 100, '%')).toBe('100%');
    });

    it('formats physical items scaling servings to grams/milliliters correctly', () => {
      expect(formatStock(10, 10, 'g', 5, 'g')).toBe('50g / 50g (10.0 / 10 srv)');
      expect(formatStock(5, 10, 'ml', 100, 'ml')).toBe('500ml / 1000ml (5.0 / 10 srv)');
    });

    it('formats non-physical items falling back to servings correctly', () => {
      expect(formatStock(4, 5, 'pcs')).toBe('4.0 / 5 srv');
      expect(formatStock(10, 10, 'packages')).toBe('10.0 / 10 srv');
    });
  });

  describe('formatStockCompact', () => {
    it('formats stock compactly correctly', () => {
      expect(formatStockCompact(75, 100, '%')).toBe('75%');
      expect(formatStockCompact(10, 10, 'g', 5, 'g')).toBe('50g/50g (10.0/10 srv)');
      expect(formatStockCompact(5, 10, 'ml', 100, 'ml')).toBe('500ml/1000ml (5.0/10 srv)');
      expect(formatStockCompact(4, 5, 'pcs')).toBe('4.0/5 srv');
      expect(formatStockCompact(10, 10, 'packages')).toBe('10.0/10 srv');
    });
  });
});
