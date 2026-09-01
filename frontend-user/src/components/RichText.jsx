// src/components/RichText.jsx
//
// Los campos de "descripción" del store config (hero, servicios, planes,
// bio de equipo, testimonios, FAQ, pasos de inicio) se editan como texto
// plano en el administrador, pero el admin puede escribir HTML básico ahí
// directo (<b>, <strong>, <h1>...) para darle formato. Sin este componente,
// React escapa cualquier etiqueta por diseño — así se ve como texto plano
// con los símbolos < > literales, no como un bug de CSS.
//
// Aquí se sanitiza con DOMPurify antes de inyectar con
// dangerouslySetInnerHTML: solo se permite un subconjunto reducido de
// etiquetas de texto/estructura, SIN atributos (bloquea onerror=,
// href="javascript:", style=, etc.) — el contenido lo escribe staff con
// acceso al admin, pero sigue siendo "HTML que un usuario escribió y se
// muestra a todos los visitantes", así que se sanitiza igual por
// higiene/defensa en profundidad (cuenta de staff comprometida, o alguien
// pega markup de una fuente no confiable sin darse cuenta).
import DOMPurify from 'dompurify';

const ALLOWED_TAGS = [
  'b', 'strong', 'i', 'em', 'u', 's', 'mark', 'small', 'sup', 'sub', 'br', 'span',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'li', 'blockquote',
];

const sanitize = (html) => DOMPurify.sanitize(html || '', { ALLOWED_TAGS, ALLOWED_ATTR: [] });

/**
 * Renderiza un campo de store config que puede traer HTML básico.
 * Siempre monta un <div> (nunca un <p>) porque el admin puede meter una
 * etiqueta de bloque (h1, p, ul...) y anidar un bloque dentro de un <p> es
 * HTML inválido — el div evita ese problema de raíz sin restringir qué
 * etiquetas se permiten.
 *
 * Se agrega la clase "rich-text" además de `className` para que las hojas de
 * estilo que antes apuntaban a un <p> a secas (ej. ".step-card p") puedan
 * seguir aplicando sin depender de que el contenido sea justo un <p>.
 */
const RichText = ({ html, className }) => (
  <div className={['rich-text', className].filter(Boolean).join(' ')} dangerouslySetInnerHTML={{ __html: sanitize(html) }} />
);

export default RichText;
