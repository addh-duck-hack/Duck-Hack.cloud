// Plantillas de correo transaccional. HTML con estilos inline (tabla) para
// máxima compatibilidad entre clientes de correo — reproduce la paleta de
// marca de frontend-user (frontend-user/src/index.css: navy + azul señal +
// ámbar) ya que las variables CSS/@import de Google Fonts no son fiables en
// la mayoría de los webmail.
const BRAND = {
  ink: "#050f16",
  panel: "#0d2130",
  line: "#1c3547",
  action: "#f8af11",
  actionHover: "#ffc94d",
  onAccent: "#03141c",
  text: "#c7dbe8",
  textDim: "#7f9aab",
  white: "#f3f9ff",
};

const monoFont = "'Courier New', Courier, monospace";
const bodyFont = "Helvetica, Arial, sans-serif";

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/**
 * Correo de verificación de cuenta.
 * @param {{ name?: string, verifyUrl: string, logoUrl?: string }} params
 * @returns {{ html: string, text: string }}
 */
const verificationEmailTemplate = ({ name, verifyUrl, logoUrl }) => {
  const safeName = escapeHtml(name || "");
  const greeting = safeName ? `Hola ${safeName},` : "Hola,";

  const html = `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Verifica tu cuenta - Duck-Hack</title>
  </head>
  <body style="margin:0; padding:0; background-color:${BRAND.ink}; font-family:${bodyFont};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.ink};">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
            <tr>
              <td align="center" style="padding-bottom:24px;">
                ${logoUrl ? `<img src="${logoUrl}" width="32" height="32" alt="Duck-Hack" style="display:inline-block; vertical-align:middle; border-radius:8px;" />` : ""}
                <span style="display:inline-block; vertical-align:middle; margin-left:10px; font-family:${monoFont}; font-size:18px; color:${BRAND.white}; letter-spacing:0.02em;">Duck-Hack</span>
              </td>
            </tr>
            <tr>
              <td style="background-color:${BRAND.panel}; border-radius:12px; padding:32px;">
                <h1 style="margin:0 0 16px; font-family:${monoFont}; font-size:20px; color:${BRAND.white}; font-weight:700;">
                  Verifica tu cuenta
                </h1>
                <p style="margin:0 0 12px; font-family:${bodyFont}; font-size:15px; line-height:1.6; color:${BRAND.textDim};">
                  ${greeting}
                </p>
                <p style="margin:0 0 24px; font-family:${bodyFont}; font-size:15px; line-height:1.6; color:${BRAND.textDim};">
                  Gracias por registrarte en Duck-Hack. Para activar tu cuenta, confirma tu correo electrónico
                  haciendo clic en el siguiente botón:
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="center" bgcolor="${BRAND.action}" style="border-radius:8px;">
                      <a href="${verifyUrl}"
                         style="display:inline-block; padding:12px 24px; font-family:${monoFont}; font-size:13px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; color:${BRAND.onAccent}; text-decoration:none; border-radius:8px;">
                        Verificar mi correo
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 0; font-family:${bodyFont}; font-size:13px; line-height:1.5; color:${BRAND.textDim};">
                  Si el botón no funciona, copia y pega este enlace en tu navegador:<br />
                  <a href="${verifyUrl}" style="color:${BRAND.action}; word-break:break-all;">${verifyUrl}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-top:24px;">
                <p style="margin:0; font-family:${bodyFont}; font-size:12px; color:${BRAND.textDim};">
                  Si no solicitaste este correo, puedes ignorarlo con confianza.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `${greeting}

Gracias por registrarte en Duck-Hack. Para activar tu cuenta, abre este enlace:
${verifyUrl}

Si no solicitaste este correo, ignóralo.`;

  return { html, text };
};

module.exports = { verificationEmailTemplate };
