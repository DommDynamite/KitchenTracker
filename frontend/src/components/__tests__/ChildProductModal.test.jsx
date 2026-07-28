import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ChildProductModal from '../ChildProductModal';

// Mock the toast context
vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  })
}));

describe('ChildProductModal Component', () => {
  const mockParent = {
    id: 1,
    name: 'Granulated Sugar',
    is_spice: 0,
    category: 'Baking',
    default_unit: 'g'
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <ChildProductModal 
        isOpen={false} 
        onClose={vi.fn()} 
        onSave={vi.fn()} 
        parentProduct={mockParent}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders correctly with default fields when open', () => {
    render(
      <ChildProductModal 
        isOpen={true} 
        onClose={vi.fn()} 
        onSave={vi.fn()} 
        parentProduct={mockParent}
      />
    );

    expect(screen.getByText('Add Brand Format')).toBeInTheDocument();
    expect(screen.getByText('Granulated Sugar')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. McCormick, Heinz, Organic Valley')).toBeInTheDocument();
  });

  it('submits correctly and calls onSave and onClose when response is successful', async () => {
    const mockSave = vi.fn();
    const mockClose = vi.fn();
    
    // Mock fetch API response
    const mockResponse = { id: 42 };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    render(
      <ChildProductModal 
        isOpen={true} 
        onClose={mockClose} 
        onSave={mockSave} 
        parentProduct={mockParent}
      />
    );

    // Enter brand name
    fireEvent.change(screen.getByPlaceholderText('e.g. McCormick, Heinz, Organic Valley'), {
      target: { value: 'Domino' }
    });

    // Click submit/Save Brand button
    fireEvent.click(screen.getByRole('button', { name: 'Save Brand' }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    expect(globalThis.fetch).toHaveBeenCalledWith('/api/products', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: expect.stringContaining('"brand":"Domino"')
    }));

    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockClose).toHaveBeenCalledTimes(1);
  });
});
