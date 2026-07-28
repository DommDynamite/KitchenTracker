import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ConfirmModal from '../ConfirmModal';

describe('ConfirmModal Component', () => {
  it('does not render when isOpen is false', () => {
    const { container } = render(
      <ConfirmModal 
        isOpen={false} 
        onConfirm={vi.fn()} 
        onCancel={vi.fn()} 
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders correctly with title, message, and button text when isOpen is true', () => {
    render(
      <ConfirmModal 
        isOpen={true} 
        title="Delete Test Item"
        message="Are you sure you want to delete this test item?"
        confirmText="Confirm Delete"
        cancelText="Keep It"
        onConfirm={vi.fn()} 
        onCancel={vi.fn()} 
      />
    );

    expect(screen.getByText('Delete Test Item')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to delete this test item?')).toBeInTheDocument();
    expect(screen.getByText('Confirm Delete')).toBeInTheDocument();
    expect(screen.getByText('Keep It')).toBeInTheDocument();
  });

  it('calls onConfirm when the confirm button is clicked', () => {
    const handleConfirm = vi.fn();
    render(
      <ConfirmModal 
        isOpen={true} 
        onConfirm={handleConfirm} 
        onCancel={vi.fn()} 
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(handleConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when the cancel button or backdrop is clicked', () => {
    const handleCancel = vi.fn();
    render(
      <ConfirmModal 
        isOpen={true} 
        onConfirm={vi.fn()} 
        onCancel={handleCancel} 
      />
    );

    // Click cancel button
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(handleCancel).toHaveBeenCalledTimes(1);

    // Click close button (X)
    fireEvent.click(screen.getByTitle('Close modal'));
    expect(handleCancel).toHaveBeenCalledTimes(2);
  });

  it('handles keyboard shortcuts (Escape and Enter)', () => {
    const handleConfirm = vi.fn();
    const handleCancel = vi.fn();
    render(
      <ConfirmModal 
        isOpen={true} 
        onConfirm={handleConfirm} 
        onCancel={handleCancel} 
      />
    );

    // Press Enter to confirm
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(handleConfirm).toHaveBeenCalledTimes(1);

    // Press Escape to cancel
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleCancel).toHaveBeenCalledTimes(1);
  });
});
