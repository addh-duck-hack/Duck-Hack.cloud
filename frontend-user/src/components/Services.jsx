// src/components/Services.jsx — PROPUESTA B: descubre (productos al azar) +
// preguntas frecuentes. Antes era "Presentaciones" (planes de precio fijos);
// se reemplazó por una muestra aleatoria del catálogo (RandomProducts.jsx) —
// ver decisión del chat. La FAQ se conserva igual.
import React, { useMemo } from 'react';
import { usePageMeta } from '../hooks/usePageMeta';
import { useStoreConfig } from '../hooks/useStoreConfig';
import { pickList } from '../utils/storeConfigLists';
import RichText from './RichText';
import RandomProducts from './RandomProducts';
import './Services.css';

const FALLBACK_FAQS = [
  {
    q: '¿Hacen envíos?',
    a: 'Sí, a todo México por paquetería. Los pedidos antes de las 12:00 se tuestan y se envían el mismo día. El envío es gratis a partir de $600.',
  },
  {
    q: '¿Cómo conservo el café?',
    a: 'En su bolsa cerrada, lejos de la luz y el calor. No lo guardes en el refrigerador. Sabe mejor entre el día 4 y el día 30 después del tueste.',
  },
  {
    q: '¿Qué molienda elijo?',
    a: 'Dinos tu método —prensa francesa, V60, espresso, cafetera italiana o americana— y lo molemos a esa medida. Si no estás seguro, pídelo en grano.',
  },
  {
    q: '¿Venden a cafeterías o mayoreo?',
    a: 'Sí. Escríbenos para precios de mayoreo, muestras y perfiles de tueste a tu gusto.',
  },
  {
    q: '¿Qué significa "de Sutu Cha\'Nu"?',
    a: 'Es tutunakú (totonaco) y nombra a la tierra que nos da de comer. Es de dónde venimos y a quién le debemos el café.',
  },
];

const Services = () => {
  usePageMeta(
    'Descubre',
    'Un vistazo aleatorio a la carta de Café Tacita — cambia cada vez que entras. Ve el catálogo completo en la tienda.'
  );

  const { config } = useStoreConfig();
  const faqs = useMemo(() => pickList(config?.faqs, FALLBACK_FAQS), [config]);

  return (
    <section className="pricing-view">
      <span className="eyebrow">Descubre</span>
      <h1 className="section-title">Algo distinto para tu taza</h1>
      <p className="section-sub">
        Un vistazo aleatorio a la carta — cambia cada vez que entras. Todo se tuesta bajo pedido y se muele a tu
        método el día del envío.
      </p>

      <RandomProducts count={6} />

      <hr className="rule" />

      <h2 className="faq-title">Preguntas frecuentes</h2>
      <div className="faq">
        {faqs.map((f) => (
          <details key={f.q}>
            <summary>{f.q}</summary>
            <RichText html={f.a} />
          </details>
        ))}
      </div>
    </section>
  );
};

export default Services;
