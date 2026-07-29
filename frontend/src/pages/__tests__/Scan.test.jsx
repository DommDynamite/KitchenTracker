import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Scan from '../Scan';

// Mock context toast
vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  })
}));

describe('Scan Page Component', () => {
  const mockProducts = [
    { id: 1, name: 'Eggs', category: 'Dairy', is_spice: 0 },
    { id: 2, name: 'Cinnamon', category: 'Spices', is_spice: 1 }
  ];

  const mockLocations = [
    { id: 1, name: 'Pantry' }
  ];

  const mockCategories = [
    { id: 1, name: 'Dairy' },
    { id: 2, name: 'Spices' }
  ];

  const mockSettings = {
    receipt_scanning_enabled: true
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    
    globalThis.fetch = vi.fn().mockImplementation((url) => {
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
      if (url.includes('/api/settings')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockSettings
        });
      }
      return Promise.resolve({ ok: false });
    });
  });

  it('renders scanner control panel when loaded and switches to receipt tab', async () => {
    render(
      <MemoryRouter>
        <Scan settings={{ receipt_scanning_enabled: true }} />
      </MemoryRouter>
    );

    // Verify presence of default barcode scanner view
    await waitFor(() => {
      expect(screen.getByText('Activate Camera Scanner')).toBeInTheDocument();
    });

    // Click the Receipt Scan tab button
    fireEvent.click(screen.getByRole('button', { name: /Receipt Scan/i }));

    // Now it should show the upload text
    expect(screen.getByText('Upload Receipt Photo')).toBeInTheDocument();
    expect(screen.getByText(/Drag & drop receipt image/i)).toBeInTheDocument();
  });
});
