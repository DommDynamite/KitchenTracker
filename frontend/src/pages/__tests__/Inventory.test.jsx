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
});
