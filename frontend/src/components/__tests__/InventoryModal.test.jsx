import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import InventoryModal from '../InventoryModal';

// Mock the toast context
vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  })
}));

describe('InventoryModal Component', () => {
  const mockProducts = [
    { id: 1, name: 'Sugar', category: 'Baking' },
    { id: 2, name: 'Milk', category: 'Dairy' }
  ];

  const mockLocations = [
    { id: 1, name: 'Pantry' },
    { id: 2, name: 'Fridge' }
  ];

  const mockCategories = [
    { id: 1, name: 'Baking', default_storage_location: 'Pantry' },
    { id: 2, name: 'Dairy', default_storage_location: 'Fridge' }
  ];

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <InventoryModal 
        isOpen={false} 
        onClose={vi.fn()} 
        onSave={vi.fn()} 
        products={mockProducts}
        locations={mockLocations}
        categories={mockCategories}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders correctly and populates product select options when open', () => {
    render(
      <InventoryModal 
        isOpen={true} 
        onClose={vi.fn()} 
        onSave={vi.fn()} 
        products={mockProducts}
        locations={mockLocations}
        categories={mockCategories}
      />
    );

    expect(screen.getByText('Log Grocery Purchase')).toBeInTheDocument();
    expect(screen.getByText('Sugar')).toBeInTheDocument();
    expect(screen.getByText('Milk')).toBeInTheDocument();
  });

  it('submits purchase correctly and calls callbacks', async () => {
    const mockSave = vi.fn();
    const mockClose = vi.fn();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 99 })
    });

    render(
      <InventoryModal 
        isOpen={true} 
        onClose={mockClose} 
        onSave={mockSave} 
        products={mockProducts}
        locations={mockLocations}
        categories={mockCategories}
      />
    );

    // Select Sugar
    fireEvent.change(screen.getAllByRole('combobox')[0], {
      target: { value: '1' }
    });

    // Fill quantity and price
    fireEvent.change(screen.getByDisplayValue('1'), {
      target: { value: '3' }
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. 3.49'), {
      target: { value: '4.50' }
    });

    // Submit form
    fireEvent.click(screen.getByRole('button', { name: 'Save Purchase' }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    expect(globalThis.fetch).toHaveBeenCalledWith('/api/inventory', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"product_id":1')
    }));

    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockClose).toHaveBeenCalledTimes(1);
  });
});
