import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ProductModal from '../ProductModal';

// Mock the toast context
vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  })
}));

describe('ProductModal Component', () => {
  const mockCategories = [
    { id: 1, name: 'Baking' },
    { id: 2, name: 'Dairy' }
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <ProductModal 
        isOpen={false} 
        onClose={vi.fn()} 
        onSave={vi.fn()} 
        categories={mockCategories}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders correctly with default fields when open', () => {
    render(
      <ProductModal 
        isOpen={true} 
        onClose={vi.fn()} 
        onSave={vi.fn()} 
        categories={mockCategories}
      />
    );

    expect(screen.getByText('Register New Product')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. Horizon Organic Whole Milk half gallon')).toBeInTheDocument();
  });

  it('submits correctly and calls onSave and onClose when response is successful', async () => {
    const mockSave = vi.fn();
    const mockClose = vi.fn();
    
    // Mock fetch API response
    const mockResponse = { id: 101 };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    render(
      <ProductModal 
        isOpen={true} 
        onClose={mockClose} 
        onSave={mockSave} 
        categories={mockCategories}
      />
    );

    // Enter name
    fireEvent.change(screen.getByPlaceholderText('e.g. Horizon Organic Whole Milk half gallon'), {
      target: { value: 'Granulated Sugar' }
    });

    // Select category Baking
    fireEvent.change(screen.getAllByRole('combobox')[0], {
      target: { value: 'Baking' }
    });

    // Click submit button (Save Product)
    fireEvent.click(screen.getByRole('button', { name: 'Save Product' }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    expect(globalThis.fetch).toHaveBeenCalledWith('/api/products', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"name":"Granulated Sugar"')
    }));

    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockClose).toHaveBeenCalledTimes(1);
  });
});
