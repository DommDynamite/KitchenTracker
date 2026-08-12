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

  it('allows adding a child brand to an existing product in receipt review', async () => {
    // Override fetch to include mock receipt parsing
    globalThis.fetch = vi.fn().mockImplementation((url, opts) => {
      if (url.includes('/api/receipts/scan')) {
        return Promise.resolve({
          ok: true,
          json: async () => ([
            {
              raw_description: 'HORIZON ORG MILK',
              expanded_description: 'Horizon Organic Whole Milk',
              price: 4.99,
              quantity: 1,
              confidence: 0.95
            }
          ])
        });
      }
      if (url.includes('/api/products') && opts?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: 99,
            name: 'Horizon Organic Eggs',
            brand: 'Horizon Organic',
            parent_product_id: 1
          })
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
      if (url.includes('/api/settings')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockSettings
        });
      }
      return Promise.resolve({ ok: false });
    });

    render(
      <MemoryRouter>
        <Scan settings={{ receipt_scanning_enabled: true }} />
      </MemoryRouter>
    );

    // Switch to Receipt Scan tab
    fireEvent.click(screen.getByRole('button', { name: /Receipt Scan/i }));

    // Simulate file upload
    const file = new File(['dummy'], 'receipt.jpg', { type: 'image/jpeg' });
    const fileInput = document.querySelector('input[type="file"]');
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Wait for receipt review wizard to show
    await waitFor(() => {
      expect(screen.getByText('Horizon Organic Whole Milk')).toBeInTheDocument();
    });

    // Open SearchableProductDropdown
    fireEvent.click(screen.getByText('Select Product...'));

    // Click Register New Brand button
    const registerBtn = screen.getByRole('button', { name: /Register New Brand/i });
    fireEvent.click(registerBtn);

    // Type selector modal should show with the 3 options
    await waitFor(() => {
      expect(screen.getByText('Select Product Type')).toBeInTheDocument();
      expect(screen.getByText('Standard Product')).toBeInTheDocument();
      expect(screen.getByText('Spice / Condiment')).toBeInTheDocument();
      expect(screen.getByText('Add to Existing Product')).toBeInTheDocument();
    });

    // Click Add to Existing Product
    fireEvent.click(screen.getByRole('button', { name: /Add to Existing Product/i }));

    // Parent product selection view should show
    await waitFor(() => {
      expect(screen.getByText('Select Existing Parent')).toBeInTheDocument();
      expect(screen.getByText('Eggs')).toBeInTheDocument();
    });

    // Select 'Eggs' parent product
    fireEvent.click(screen.getByText('Eggs'));

    // ChildProductModal should open for 'Eggs'
    await waitFor(() => {
      expect(screen.getByText('Add Brand Format')).toBeInTheDocument();
    });

    // Fill in Brand name and submit
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. McCormick, Heinz, Organic Valley/i), {
      target: { value: 'Horizon Organic' }
    });
    fireEvent.click(screen.getByRole('button', { name: /Save Brand/i }));

    // Receipt review should now map the item to the new child product
    await waitFor(() => {
      expect(screen.queryByText('Add Brand Format')).not.toBeInTheDocument();
    });
  });
});
