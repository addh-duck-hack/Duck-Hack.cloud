import { render, screen } from '@testing-library/react';
import App from './App';

test('muestra la pantalla de inicio de sesión del panel', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: /iniciar sesión/i })).toBeInTheDocument();
});
