import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ToastProvider, useToast } from '../ToastContext';

// Helper component to trigger toasts
const TestComponent = ({ message, type, duration }) => {
  const { showToast } = useToast();
  return (
    <button onClick={() => showToast(message, type, duration)}>
      Show Toast
    </button>
  );
};

describe('ToastContext & ToastProvider', () => {
  it('throws an error when useToast is used outside of ToastProvider', () => {
    // Suppress React console error warnings about boundary errors during test
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    expect(() => render(<TestComponent message="Test" />)).toThrow(
      'useToast must be used within a ToastProvider'
    );
    
    consoleError.mockRestore();
  });

  it('renders children correctly inside ToastProvider', () => {
    render(
      <ToastProvider>
        <div data-testid="child">Test Child</div>
      </ToastProvider>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('shows toast with correct message and type when triggered', () => {
    render(
      <ToastProvider>
        <TestComponent message="Operation Successful" type="success" />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('Show Toast'));
    expect(screen.getByText('Operation Successful')).toBeInTheDocument();
  });

  it('removes toast when dismiss button is clicked', () => {
    render(
      <ToastProvider>
        <TestComponent message="Dismissable Toast" type="info" />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('Show Toast'));
    expect(screen.getByText('Dismissable Toast')).toBeInTheDocument();

    // Click on the dismiss button
    const closeButton = screen.getByRole('button', { name: '' });
    fireEvent.click(closeButton);

    expect(screen.queryByText('Dismissable Toast')).not.toBeInTheDocument();
  });

  it('auto-dismisses toast after specified duration', async () => {
    vi.useFakeTimers();
    
    render(
      <ToastProvider>
        <TestComponent message="Timed Toast" type="warning" duration={1000} />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('Show Toast'));
    expect(screen.getByText('Timed Toast')).toBeInTheDocument();

    // Fast-forward time
    act(() => {
      vi.advanceTimersByTime(1050);
    });

    expect(screen.queryByText('Timed Toast')).not.toBeInTheDocument();
    
    vi.useRealTimers();
  });
});
