import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Settings from '../Settings';

// Mock context toast
vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  })
}));

describe('Settings Page Component', () => {
  const mockIgnoredItems = [
    { id: 1, raw_description: 'Nonsense item' }
  ];

  const mockLocations = [
    { id: 1, name: 'Pantry' }
  ];

  const mockCategories = [
    { id: 1, name: 'Dairy' }
  ];

  const mockLogs = [
    { id: 1, action_type: 'consume', details: 'Consumed milk', timestamp: '2026-07-28' }
  ];

  const mockSettings = {
    receipt_scanning_enabled: true
  };

  beforeEach(() => {
    vi.restoreAllMocks();

    const mockFetch = vi.fn().mockImplementation((url, options) => {
      const cleanUrl = url.split('?')[0];
      if (cleanUrl === '/api/settings/ignored') {
        return Promise.resolve({
          ok: true,
          json: async () => mockIgnoredItems
        });
      }
      if (cleanUrl === '/api/settings' && options?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({})
        });
      }
      if (cleanUrl === '/api/locations') {
        return Promise.resolve({
          ok: true,
          json: async () => mockLocations
        });
      }
      if (cleanUrl === '/api/categories') {
        return Promise.resolve({
          ok: true,
          json: async () => mockCategories
        });
      }
      if (cleanUrl === '/api/activity-log') {
        return Promise.resolve({
          ok: true,
          json: async () => mockLogs
        });
      }
      return Promise.resolve({ ok: false });
    });

    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders settings sections correctly when loaded', async () => {
    render(
      <MemoryRouter>
        <Settings settings={mockSettings} setSettings={vi.fn()} />
      </MemoryRouter>
    );

    // Wait for settings sections to render
    await waitFor(() => {
      expect(screen.getByText('Add New Location')).toBeInTheDocument();
    });

    expect(screen.getByText(/Configured Locations/i)).toBeInTheDocument();
  });
});
