import { render, screen } from '@testing-library/react';
import App from './App';

test('monta la app y pinta Inicio', () => {
  render(<App />);
  // La sección de origen es contenido fijo: aparece aunque el backend no responda.
  expect(screen.getByRole('heading', { name: /Xicotepec/ })).toBeInTheDocument();
});
