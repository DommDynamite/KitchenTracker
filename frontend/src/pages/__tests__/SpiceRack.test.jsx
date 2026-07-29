import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import SpiceRack from '../SpiceRack';

// Mock context toast
vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  })
}));

describe('SpiceRack Page Component', () => {
  const mockSpices = [
    { 
      id: 1, 
      activePercentage: 75, 
      totalContainers: 1,
      brands: [
        { id: 1, brand: 'McCormick' }
      ],
      product: { 
        id: 10, 
        name: 'Garlic Powder', 
        brand: 'McCormick', 
        category: 'Spices', 
        parent_product_id: 10 
      } 
    }
  ];

  const mockParentProducts = [
    { id: 10, name: 'Garlic Powder', category: 'Spices', is_parent: 1 }
  ];

  const mockCategories = [
    { id: 1, name: 'Spices' }
  ];

  beforeEach(() => {
    vi.restoreAllMocks();

    const mockFetch = vi.fn().mockImplementation((url, options) => {
      const cleanUrl = url.split('?')[0];
      if (cleanUrl === '/api/spices/quick-add' && options?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: 102 })
        });
      }
      if (cleanUrl === '/api/spices') {
        return Promise.resolve({
          ok: true,
          json: async () => mockSpices
        });
      }
      if (cleanUrl === '/api/products') {
        return Promise.resolve({
          ok: true,
          json: async () => mockParentProducts
        });
      }
      if (cleanUrl === '/api/categories') {
        return Promise.resolve({
          ok: true,
          json: async () => mockCategories
        });
      }
      return Promise.resolve({ ok: false });
    });

    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders spice rack cards when data is loaded', async () => {
    render(
      <MemoryRouter>
        <SpiceRack />
      </MemoryRouter>
    );

    // Wait for data load
    await waitFor(() => {
      expect(screen.getByText('Garlic Powder')).toBeInTheDocument();
    });

    expect(screen.getByText('McCormick')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
  });
});
