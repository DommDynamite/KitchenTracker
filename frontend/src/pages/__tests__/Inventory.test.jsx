import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Inventory from '../Inventory';

// Mock context toast
vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  })
}));

describe('Inventory Page Component', () => {
  const mockInventory = [
    {
      id: 10,
      product_id: 1,
      product_name: 'Sugar',
      product_brand: 'Domino',
      quantity: 1,
      remaining_servings: 10,
      original_servings: 10,
      storage_location: 'Pantry',
      expiration_date: '2026-08-15',
      purchase_date: '2026-07-28',
      status: 'unopened',
      price: 2.50
    }
  ];

  const mockProducts = [
    { id: 1, name: 'Sugar', category: 'Baking', is_parent: 0 }
  ];

  const mockLocations = [
    { id: 1, name: 'Pantry' },
    { id: 2, name: 'Fridge' }
  ];

  const mockCategories = [
    { id: 1, name: 'Baking', default_storage_location: 'Pantry' }
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    
    // Mock the window.fetch calls
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('/api/inventory')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockInventory
        });
      }
      if (url.includes('/api/products')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockProducts
        });
      }
      if (url.includes('/api/locations')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockLocations
        });
      }
      if (url.includes('/api/categories')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockCategories
        });
      }
      return Promise.resolve({ ok: false });
    });
  });

  it('renders inventory groups when loaded', async () => {
    render(
      <MemoryRouter>
        <Inventory />
      </MemoryRouter>
    );

    // Wait for the inventory list items to load
    await waitFor(() => {
      expect(screen.getByText('Sugar')).toBeInTheDocument();
    });

    expect(screen.getByText('Domino')).toBeInTheDocument();
    expect(screen.getByText('10.0 / 10 srv')).toBeInTheDocument();
  });

  it('filters list results when search query is entered', async () => {
    render(
      <MemoryRouter>
        <Inventory />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Sugar')).toBeInTheDocument();
    });

    // Enter search query that doesn't match Sugar
    fireEvent.change(screen.getByPlaceholderText(/filter/i), {
      target: { value: 'Milk' }
    });

    // Sugar should no longer be visible
    expect(screen.queryByText('Sugar')).not.toBeInTheDocument();
  });

  it('prompts confirmation when clicking Consume Package in edit modal', async () => {
    render(
      <MemoryRouter>
        <Inventory />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Sugar')).toBeInTheDocument();
    });

    // Click manage packages icon button
    fireEvent.click(screen.getByTitle('Manage Product Packages'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Consume Package/i })).toBeInTheDocument();
    });

    // Click Consume Package
    fireEvent.click(screen.getByRole('button', { name: /Consume Package/i }));

    // Confirmation modal should appear
    await waitFor(() => {
      expect(screen.getByText(/Are you sure you want to consume all remaining servings/i)).toBeInTheDocument();
    });

    // Click Confirm Consume button
    const consumeButtons = screen.getAllByRole('button', { name: /^Consume$/i });
    const confirmBtn = consumeButtons[consumeButtons.length - 1];
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(screen.queryByText(/Are you sure you want to consume all remaining servings/i)).not.toBeInTheDocument();
    });
  });

  it('allows updating an inventory package brand to a child product in edit modal', async () => {
    const customProducts = [
      { id: 100, name: 'Tortillas', category: 'Pantry', is_parent: 1, brand: '' },
      { id: 101, name: 'Tortillas', category: 'Pantry', is_parent: 0, brand: 'Mission', parent_product_id: 100 }
    ];
    const customInventory = [
      {
        id: 50,
        product_id: 100,
        parent_product_id: null,
        product_name: 'Tortillas',
        product_brand: '',
        quantity: 1,
        remaining_servings: 10,
        original_servings: 10,
        storage_location: 'Pantry',
        expiration_date: '2026-08-20',
        purchase_date: '2026-08-01',
        status: 'unopened'
      }
    ];

    let putBody = null;
    globalThis.fetch = vi.fn().mockImplementation((url, opts) => {
      if (url.includes('/api/inventory/50') && opts?.method === 'PUT') {
        putBody = JSON.parse(opts.body);
        return Promise.resolve({
          ok: true,
          json: async () => ({ message: 'Updated', id: 50, product_id: putBody.product_id })
        });
      }
      if (url.includes('/api/inventory')) {
        return Promise.resolve({
          ok: true,
          json: async () => customInventory
        });
      }
      if (url.includes('/api/products')) {
        return Promise.resolve({
          ok: true,
          json: async () => customProducts
        });
      }
      if (url.includes('/api/locations')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockLocations
        });
      }
      if (url.includes('/api/categories')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockCategories
        });
      }
      return Promise.resolve({ ok: false });
    });

    render(
      <MemoryRouter>
        <Inventory />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Tortillas')).toBeInTheDocument();
    });

    // Open manage packages modal
    fireEvent.click(screen.getByTitle('Manage Product Packages'));

    await waitFor(() => {
      expect(screen.getByLabelText(/Product Brand/i)).toBeInTheDocument();
    });

    // Change brand dropdown to Mission (id: 101)
    fireEvent.change(screen.getByLabelText(/Product Brand/i), {
      target: { value: '101' }
    });

    // Click Save Changes
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

    await waitFor(() => {
      expect(putBody).not.toBeNull();
      expect(putBody.product_id).toBe(101);
    });
  });
});
