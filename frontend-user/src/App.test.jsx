import { render, screen } from '@testing-library/react';
import App from './App';

test('monta la app y pinta la ruta de inicio', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: 'Inicio' })).toBeInTheDocument();
});
