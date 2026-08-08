import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ShoppingList from '../ShoppingList';

// Mock context toast
vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  })
}));

describe('ShoppingList Page Component', () => {
  const mockShoppingList = {
    auto: [
      { id: 1, product_name: 'Eggs', category: 'Dairy', brand: 'Horizon', amount: 10, unit: 'ml', checked: false }
    ],
    manual: [
      { id: 2, product_name: 'Bananas', category: 'Produce', amount: 3, unit: 'pcs', checked: false }
    ]
  };

  const mockCategories = [
    { id: 1, name: 'Dairy' },
    { id: 2, name: 'Produce' }
  ];

  const mockProducts = [
    { id: 1, name: 'Eggs', category: 'Dairy' }
  ];

  const mockLocations = [
    { id: 1, name: 'Pantry' }
  ];

  beforeEach(() => {
    vi.restoreAllMocks();

    const mockFetch = vi.fn().mockImplementation((url, options) => {
      const cleanUrl = url.split('?')[0];
      if (cleanUrl === '/api/shopping-list' && options?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: 102 })
        });
      }
      if (cleanUrl === '/api/shopping-list') {
        return Promise.resolve({
          ok: true,
          json: async () => mockShoppingList
        });
      }
      if (cleanUrl === '/api/categories') {
        return Promise.resolve({
          ok: true,
          json: async () => mockCategories
        });
      }
      if (cleanUrl === '/api/products') {
        return Promise.resolve({
          ok: true,
          json: async () => mockProducts
        });
      }
      if (cleanUrl === '/api/locations') {
        return Promise.resolve({
          ok: true,
          json: async () => mockLocations
        });
      }
      return Promise.resolve({ ok: false });
    });

    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders shopping list sections correctly when loaded', async () => {
    render(
      <MemoryRouter>
        <ShoppingList />
      </MemoryRouter>
    );

    // Wait for list items to load
    await waitFor(() => {
      expect(screen.getByText('Eggs')).toBeInTheDocument();
    });

    expect(screen.getByText('Bananas')).toBeInTheDocument();
  });

  it('allows adding manual custom item to shopping list with direct text input', async () => {
    render(
      <MemoryRouter>
        <ShoppingList />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Eggs')).toBeInTheDocument();
    });

    // Click button to open custom item modal
    fireEvent.click(screen.getByRole('button', { name: /Add Custom Item/i }));

    // Type custom item name
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. Paper Towels/i), {
      target: { value: 'Paper Towels' }
    });

    // Fill amount
    fireEvent.change(screen.getByPlaceholderText('e.g. 2'), {
      target: { value: '2' }
    });

    // Click submit button
    fireEvent.click(screen.getByRole('button', { name: /Add Item/i }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Add Item/i })).not.toBeInTheDocument();
    });
  });

  it('allows adding item selected from catalog mode', async () => {
    render(
      <MemoryRouter>
        <ShoppingList />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Eggs')).toBeInTheDocument();
    });

    // Click button to open custom item modal
    fireEvent.click(screen.getByRole('button', { name: /Add Custom Item/i }));

    // Switch to catalog mode
    fireEvent.click(screen.getByRole('button', { name: /From Product Catalog/i }));

    // Select product from choose dropdown (the first combobox)
    fireEvent.change(screen.getAllByRole('combobox')[0], {
      target: { value: '1' }
    });

    // Fill amount
    fireEvent.change(screen.getByPlaceholderText('e.g. 2'), {
      target: { value: '5' }
    });

    // Click submit button
    fireEvent.click(screen.getByRole('button', { name: /Add Item/i }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Add Item/i })).not.toBeInTheDocument();
    });
  });
});
