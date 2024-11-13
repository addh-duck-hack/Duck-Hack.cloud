// src/components/PrivacyNotice.js
import React from 'react';
import './LegalNotice.css';

const PrivacyNotice = () => {
  return (
    <div className="legal-notice-container">
      <h1>Aviso de Privacidad</h1>
      <section>
        <p>Duck Hack (en adelante, "la Empresa"), representada legalmente por Adrián Cabrera Jacobo, con domicilio en Priv. Flor de Azucena No 112, Col. Paseos de Chavarría, Mineral de la Reforma, Hidalgo, y con el Registro Federal de Contribuyentes CAJA911127IH1, reconoce la importancia de proteger los datos personales proporcionados por sus clientes, proveedores, colaboradores y usuarios (en adelante, "Titulares").</p>
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
        <p>Si el Titular no desea que sus datos sean utilizados para fines secundarios, podrá manifestarlo a través del correo a.jacobo@duck-hack.com.</p>
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
          <li>A proveedores de servicios de almacenamiento y procesamiento de datos, siempre bajo estrictas medidas de seguridad.</li>
        </ul>
        <p>En todos los casos, Duck Hack se compromete a que estos terceros mantengan la confidencialidad y protección de los datos.</p>
      </section>
      <section>
        <h2>5. Derechos ARCO (Acceso, Rectificación, Cancelación y Oposición)</h2>
        <p>Los Titulares tienen derecho a ejercer sus derechos ARCO respecto a sus datos personales. Para ello, podrán enviar una solicitud a a.jacobo@duck-hack.com indicando su nombre, los derechos que desea ejercer y los datos sobre los que desea ejercerlos. La Empresa responderá en un plazo de 20 días hábiles.</p>
      </section>
      <section>
        <h2>6. Modificaciones al Aviso de Privacidad</h2>
        <p>La Empresa se reserva el derecho de realizar modificaciones o actualizaciones a este Aviso de Privacidad en cualquier momento. Cualquier cambio será comunicado a través de nuestro sitio web https://mx.duck-hack.cloud, en la sección de Aviso de Privacidad.</p>
      </section>
      <section>
        <h2>7. Consentimiento</h2>
        <p>Al proporcionar sus datos personales, el Titular confirma que ha leído y comprendido el contenido de este Aviso de Privacidad y que otorga su consentimiento para el tratamiento de sus datos conforme a los términos aquí establecidos.</p>
      </section>
    </div>
  );
};

export default PrivacyNotice;
