// src/pages/ReturnsPolicy.jsx — ruta /politica-de-devoluciones: el texto que
// el admin captura en Configurar tienda → Identidad legal
// (StoreConfig.returnsPolicy, HTML básico). Sin texto, la página no tiene
// contenido propio: el pie de página ni siquiera la enlaza.
import React from 'react';
import { Link } from 'react-router-dom';
import { useStoreConfig } from '../hooks/useStoreConfig';
import { usePageMeta } from '../hooks/usePageMeta';
import LegalPage from '../components/LegalPage';

const ReturnsPolicy = () => {
  usePageMeta('Política de devoluciones', 'Cambios, devoluciones y reembolsos de los pedidos de la tienda.');
  const { config, isLoading } = useStoreConfig();

  return (
    <LegalPage title="Política de devoluciones" html={config?.returnsPolicy}>
      {isLoading ? null : (
        <p>
          Si necesitas cambiar o devolver un pedido, <Link to="/contacto">escríbenos</Link> y te ayudamos.
        </p>
      )}
    </LegalPage>
  );
};

export default ReturnsPolicy;
