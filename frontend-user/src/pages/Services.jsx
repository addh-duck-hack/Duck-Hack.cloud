// src/pages/Services.jsx — catálogo de servicios por categoría
// (GET /api/services/public, ya ordenado por categoría y servicio).
import React from 'react';
import { useApi } from '../hooks/useApi';
import { Loading, Notice, PageTitle } from '../ui/bits';
import { errorText } from '../utils/format';
import { listItems } from '../utils/products';
import { ServiceCard } from './Home';

const Services = () => {
  const { data, error, isLoading } = useApi('/api/services/public');
  const groups = [];
  listItems(data).forEach((s) => {
    const name = s.category?.name || 'Otros servicios';
    let group = groups.find((g) => g.name === name);
    if (!group) groups.push((group = { name, items: [] }));
    group.items.push(s);
  });

  return (
    <div className="wrap">
      <PageTitle title="Servicios" subtitle="Elige uno o varios y agenda en línea." />
      {isLoading ? <Loading /> : null}
      <Notice type="error">{error ? errorText(error) : ''}</Notice>
      {!isLoading && !error && !groups.length ? <p className="muted">Pronto publicaremos nuestros servicios.</p> : null}
      {groups.map((g) => (
        <section key={g.name} className="section">
          <h2 className="section__title">{g.name}</h2>
          <div className="grid grid--3">
            {g.items.map((s) => <ServiceCard key={s._id} service={s} />)}
          </div>
        </section>
      ))}
    </div>
  );
};

export default Services;
