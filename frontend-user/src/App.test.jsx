import { render } from '@testing-library/react';
import App from './App';

test('muestra el loader de Café Tacita al montar', () => {
  const { container } = render(<App />);
  expect(container.querySelector('.loader-container')).toBeInTheDocument();
});
