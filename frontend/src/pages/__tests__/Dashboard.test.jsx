import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from '../Dashboard';

describe('Dashboard Page Component', () => {
  const mockInventory = [
    { id: 1, product_name: 'Sugar', expiration_date: '2026-08-15', status: 'unopened', remaining_servings: 10 },
    { id: 2, product_name: 'Milk', expiration_date: '2026-06-01', status: 'opened', remaining_servings: 5 }
  ];

  const mockRecipes = [
    { id: 1, name: 'Cookies' }
  ];

  const mockShoppingList = {
    auto: [
      { id: 1, product_name: 'Eggs', category: 'Dairy', amount: 2, unit: 'pkg' }
    ],
    manual: []
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    
    const mockFetch = vi.fn().mockImplementation((url) => {
      const cleanUrl = url.split('?')[0];
      if (cleanUrl === '/api/inventory') {
        return Promise.resolve({
          ok: true,
          json: async () => mockInventory
        });
      }
      if (cleanUrl === '/api/recipes') {
        return Promise.resolve({
          ok: true,
          json: async () => mockRecipes
        });
      }
      if (cleanUrl === '/api/shopping-list') {
        return Promise.resolve({
          ok: true,
          json: async () => mockShoppingList
        });
      }
      return Promise.resolve({ ok: false });
    });

    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders dashboard summary tiles when data is loaded', async () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    // Wait for data load
    await waitFor(() => {
      expect(screen.getByText(/Dashboard/i)).toBeInTheDocument();
    });

    // Check stats indicators
    expect(screen.getByText('In Stock Items')).toBeInTheDocument();
    expect(screen.getByText('Expired Foods')).toBeInTheDocument();
    expect(screen.getByText('Expiring Soon')).toBeInTheDocument();
  });
});
