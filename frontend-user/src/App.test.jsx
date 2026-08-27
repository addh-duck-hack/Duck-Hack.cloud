import { render, screen } from '@testing-library/react';
import App from './App';

test('muestra el loader de Duck-Hack al montar', () => {
  render(<App />);
  const logo = screen.getByAltText(/duck-hack/i);
  expect(logo).toBeInTheDocument();
});
