// src/pages/PrivacyNotice.jsx
import React from 'react';
import { useStoreConfig } from '../hooks/useStoreConfig';
import { usePageMeta } from '../hooks/usePageMeta';

// Ver nota de fallback en LegalNotice.jsx — mismo criterio aquí.
const FALLBACK_LEGAL_IDENTITY = {
  legalName: 'Duck Hack',
  rfc: 'CAJA911127IH1',
  legalRepresentative: 'Adrián Cabrera Jacobo',
  legalAddress: 'Priv. Flor de Azucena No 112, Col. Paseos de Chavarría, Mineral de la Reforma, Hidalgo',
};

const PrivacyNotice = () => {
  usePageMeta('Aviso de Privacidad', 'Cómo Duck-Hack recaba, usa y protege los datos personales de clientes, proveedores y usuarios.');

  const { config } = useStoreConfig();
  const legal = { ...FALLBACK_LEGAL_IDENTITY, ...Object.fromEntries(Object.entries(config?.legalIdentity || {}).filter(([, v]) => v)) };

  return (
    <div className="legal-notice-container">
      <h1>Aviso de Privacidad</h1>
      <section>
        <p>{legal.legalName} (en adelante, "la Empresa"), representada legalmente por {legal.legalRepresentative}, con domicilio en {legal.legalAddress}, y con el Registro Federal de Contribuyentes {legal.rfc}, reconoce la importancia de proteger los datos personales proporcionados por sus clientes, proveedores, colaboradores y usuarios (en adelante, "Titulares").</p>
      </section>
      <section>
        <h2>1. Datos personales que se recaban</h2>
        <p>La Empresa recaba los siguientes datos personales de los Titulares:</p>
        <ul>
          <li>Información de contacto: nombre, correo electrónico, teléfono.</li>
          <li>Datos fiscales y de facturación: RFC, domicilio fiscal, datos bancarios.</li>
          <li>Información para el uso de servicios de hosting y desarrollo de software: preferencias de servicios, dominios contratados, detalles técnicos relacionados con los servicios ofrecidos.</li>
        </ul>
      </section>
      <section>
        <h2>2. Finalidades del tratamiento de datos personales</h2>
        <p>Los datos personales serán utilizados para los siguientes fines:</p>
        <h3>Primarios (necesarios para la relación jurídica con la Empresa):</h3>
        <ul>
          <li>Proveer los servicios y productos solicitados.</li>
          <li>Generar facturas y cumplir con obligaciones fiscales.</li>
          <li>Administrar, operar y gestionar los servicios de hosting y desarrollo de software contratados.</li>
        </ul>
        <h3>Secundarios (opcional):</h3>
        <ul>
          <li>Enviar información promocional sobre nuevos servicios o actualizaciones de los productos.</li>
          <li>Realizar encuestas de satisfacción y estudios de mercado.</li>
        </ul>
        <p>Si el Titular no desea que sus datos sean utilizados para fines secundarios, podrá manifestarlo a través del correo <a href="mailto:legal@duck-hack.com">legal@duck-hack.com</a>.</p>
      </section>
      <section>
        <h2>3. Protección y seguridad de los datos personales</h2>
        <p>La Empresa implementa las medidas de seguridad administrativas, técnicas y físicas necesarias para proteger los datos personales contra daño, pérdida, alteración, destrucción o el uso, acceso o tratamiento no autorizado.</p>
      </section>
      <section>
        <h2>4. Transferencia de datos personales</h2>
        <p>La Empresa únicamente compartirá los datos personales de los Titulares con terceros en los siguientes casos:</p>
        <ul>
          <li>Cuando sea necesario para cumplir con obligaciones legales.</li>
          <li>Cuando sea requerido por autoridades competentes dentro de los límites permitidos por la ley.</li>
          <li>A proveedores de servicios de almacenamiento y procesamiento de datos (por ejemplo, servicios de analítica web como Google Analytics), siempre bajo estrictas medidas de seguridad.</li>
        </ul>
        <p>En todos los casos, Duck Hack se compromete a que estos terceros mantengan la confidencialidad y protección de los datos.</p>
      </section>
      <section>
        <h2>5. Herramientas de inteligencia artificial utilizadas en el desarrollo del sitio</h2>
        <p>Este sitio web es diseñado y mantenido con apoyo de Claude, una herramienta de inteligencia artificial de asistencia a la programación desarrollada por Anthropic PBC. Esta herramienta se utiliza únicamente como apoyo técnico en la programación, mantenimiento y actualización del código y contenido del sitio.</p>
        <p>El uso de esta herramienta no implica que los datos personales de los visitantes, clientes o usuarios de este sitio sean compartidos, transferidos o procesados por Anthropic PBC ni por ningún otro proveedor de inteligencia artificial. Los datos personales que usted proporciona a través de este sitio (formularios de contacto, registro, compras, entre otros) se tratan exclusivamente conforme a lo descrito en este Aviso de Privacidad, y no se envían a servicios de inteligencia artificial como parte de la operación del sitio.</p>
      </section>
      <section>
        <h2>6. Uso de cookies y tecnologías de análisis (Google Analytics)</h2>
        <p>Este sitio web utiliza Google Analytics, un servicio de analítica web proporcionado por Google LLC ("Google"), que emplea cookies y tecnologías similares para recopilar y analizar de forma agregada información sobre el uso del sitio, tales como: páginas visitadas, tiempo de navegación, tipo de dispositivo y navegador, y ubicación geográfica aproximada (nunca el domicilio exacto del Titular). Esta información nos permite conocer el comportamiento general de nuestros visitantes y mejorar el contenido y funcionamiento del sitio.</p>
        <p>La información recabada por Google Analytics es tratada por Google LLC, con sede en Estados Unidos, conforme a sus propias políticas de privacidad, disponibles en <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">https://policies.google.com/privacy</a>. Si el Titular desea impedir el uso de estas cookies de análisis, puede: (i) configurar su navegador para bloquear o eliminar cookies, o (ii) instalar el complemento de inhabilitación de Google Analytics disponible en <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener noreferrer">https://tools.google.com/dlpage/gaoptout</a>.</p>
        <p>Esta información no se utiliza para fines de mercadotecnia dirigida ni se comparte con propósitos distintos a los aquí descritos.</p>
      </section>
      <section>
        <h2>7. Derechos ARCO (Acceso, Rectificación, Cancelación y Oposición)</h2>
        <p>Los Titulares tienen derecho a ejercer sus derechos ARCO (Acceso, Rectificación, Cancelación y Oposición) respecto a sus datos personales. Para ello, podrán enviar una solicitud al correo <a href="mailto:arco@duck-hack.com">arco@duck-hack.com</a> indicando su nombre, el derecho o derechos que desea ejercer (acceder a sus datos, corregirlos, cancelarlos u oponerse a su tratamiento) y los datos sobre los que desea ejercerlos, acompañando copia de una identificación oficial que acredite su identidad o la de su representante legal. La Empresa responderá en un plazo de 20 días hábiles contados a partir de la recepción de la solicitud.</p>
      </section>
      <section>
        <h2>8. Modificaciones al Aviso de Privacidad</h2>
        <p>La Empresa se reserva el derecho de realizar modificaciones o actualizaciones a este Aviso de Privacidad en cualquier momento. Cualquier cambio será comunicado a través de nuestro sitio web https://mx.duck-hack.cloud, en la sección de Aviso de Privacidad.</p>
      </section>
      <section>
        <h2>9. Consentimiento</h2>
        <p>Al proporcionar sus datos personales, el Titular confirma que ha leído y comprendido el contenido de este Aviso de Privacidad y que otorga su consentimiento para el tratamiento de sus datos conforme a los términos aquí establecidos.</p>
      </section>
    </div>
  );
};

export default PrivacyNotice;
