import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders the shell with the reporting currency and local-only notice', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /fleet & asset management/i })).toBeInTheDocument();
    expect(screen.getByText('GHS')).toBeInTheDocument();
    expect(screen.getByText(/does not\s+sync between devices/i)).toBeInTheDocument();
  });
});
