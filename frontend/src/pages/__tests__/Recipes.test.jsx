import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Recipes from '../Recipes';

// Mock context toast
vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  })
}));

describe('Recipes Page Component', () => {
  const mockRecipes = [
    { id: 1, name: 'Chocolate Chip Cookies', description: 'Chewy delicious cookies', servings: 24, created_at: '2026-07-28' },
    { id: 2, name: 'Scrambled Eggs', description: 'Simple breakfast scrambled eggs', servings: 2, created_at: '2026-07-28' }
  ];

  const mockProducts = [
    { id: 1, name: 'Eggs', category: 'Dairy' }
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('/api/recipes')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockRecipes
        });
      }
      if (url.includes('/api/products')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockProducts
        });
      }
      return Promise.resolve({ ok: false });
    });
  });

  it('renders recipes when loaded', async () => {
    render(
      <MemoryRouter>
        <Recipes />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Chocolate Chip Cookies')).toBeInTheDocument();
    });

    expect(screen.getByText('Scrambled Eggs')).toBeInTheDocument();
    expect(screen.getByText('Chewy delicious cookies')).toBeInTheDocument();
    expect(screen.getByText('Simple breakfast scrambled eggs')).toBeInTheDocument();
  });

  it('filters recipes list when search query is entered', async () => {
    render(
      <MemoryRouter>
        <Recipes />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Chocolate Chip Cookies')).toBeInTheDocument();
    });

    // Enter search query that only matches Scrambled Eggs
    fireEvent.change(screen.getByPlaceholderText(/search recipes/i), {
      target: { value: 'Eggs' }
    });

    expect(screen.getByText('Scrambled Eggs')).toBeInTheDocument();
    expect(screen.queryByText('Chocolate Chip Cookies')).not.toBeInTheDocument();
  });
});
