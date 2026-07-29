import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Products from '../Products';

// Mock context toast
vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  })
}));

describe('Products Page Component', () => {
  const mockProducts = [
    { id: 1, name: 'Whole Milk', category: 'Dairy', brand: 'Horizon', is_parent: 0 },
    { id: 2, name: 'Sugar', category: 'Baking', brand: 'Domino', is_parent: 0 }
  ];

  const mockCategories = [
    { id: 1, name: 'Baking' },
    { id: 2, name: 'Dairy' }
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('/api/products')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockProducts
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

  it('renders products when loaded', async () => {
    render(
      <MemoryRouter>
        <Products />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Whole Milk')).toBeInTheDocument();
    });

    expect(screen.getByText('Sugar')).toBeInTheDocument();
    expect(screen.getByText(/Horizon/i)).toBeInTheDocument();
    expect(screen.getByText(/Domino/i)).toBeInTheDocument();
  });

  it('filters products list when search query is entered', async () => {
    render(
      <MemoryRouter>
        <Products />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Whole Milk')).toBeInTheDocument();
    });

    // Enter search query that only matches Whole Milk
    fireEvent.change(screen.getByPlaceholderText(/search/i), {
      target: { value: 'Milk' }
    });

    expect(screen.getByText('Whole Milk')).toBeInTheDocument();
    expect(screen.queryByText('Sugar')).not.toBeInTheDocument();
  });
});
