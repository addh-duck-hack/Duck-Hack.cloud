import { render, screen } from '@testing-library/react';
import App from './App';

test('muestra el menú del salón y la tienda', () => {
  render(<App />);
  expect(screen.getAllByRole('link', { name: /agendar cita/i }).length).toBeGreaterThan(0);
  expect(screen.getAllByRole('link', { name: /^tienda$/i }).length).toBeGreaterThan(0);
});
