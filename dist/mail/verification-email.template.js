"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildVerificationEmailHtml = buildVerificationEmailHtml;
function buildVerificationEmailHtml(name, code) {
    const codeDigits = code.split('');
    return `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>Verifica tu correo — CloudCore</title>
<!--[if mso]>
<style>table, td { font-family: Arial, sans-serif !important; }</style>
<![endif]-->
</head>
<body style="margin:0; padding:0; background-color:#f6f8fa; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color-scheme:light; supported-color-schemes:light;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0;">Tu código de verificación de CloudCore&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f6f8fa" style="background-color:#f6f8fa; padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="max-width:480px; width:100%; background-color:#ffffff; border:1px solid #d0d7de; border-radius:12px; overflow:hidden;">

          <!-- Brand header -->
          <tr>
            <td align="center" bgcolor="#ffffff" style="padding:36px 32px 20px; background-color:#ffffff;">
              <img src="cid:cloudcore-logo" width="44" height="44" alt="CloudCore" style="display:block; margin:0 auto 12px;" />
              <span style="font-size:20px; font-weight:800; color:#1f2328; letter-spacing:-0.5px;">CloudCore</span>
            </td>
          </tr>

          <tr>
            <td style="padding:0 32px;">
              <hr style="border:none; border-top:1px solid #d0d7de; margin:0;" />
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td bgcolor="#ffffff" style="padding:32px 32px 8px; background-color:#ffffff;">
              <p style="margin:0 0 4px; font-size:16px; font-weight:700; color:#1f2328;">Hola${name ? `, ${escapeHtml(name)}` : ''} 👋</p>
              <p style="margin:0; font-size:14px; line-height:1.6; color:#57606a;">
                Usa este código para verificar tu correo y terminar de crear tu cuenta en CloudCore. Es válido por 15 minutos.
              </p>
            </td>
          </tr>

          <!-- Code -->
          <tr>
            <td align="center" bgcolor="#ffffff" style="padding:24px 32px; background-color:#ffffff;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  ${codeDigits.map((d, i) => `
                  <td bgcolor="#f6f8fa" style="width:44px; height:56px; background-color:#f6f8fa; border:1px solid #d0d7de; border-radius:8px; text-align:center; vertical-align:middle; font-size:26px; font-weight:800; color:#1f2328; font-family:'Courier New',monospace;">
                    ${escapeHtml(d)}
                  </td>
                  ${i < codeDigits.length - 1 ? '<td style="width:8px;"></td>' : ''}
                  `).join('')}
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td bgcolor="#ffffff" style="padding:0 32px 28px; background-color:#ffffff;">
              <p style="margin:0; font-size:13px; line-height:1.6; color:#8b949e; text-align:center;">
                Si tú no solicitaste crear una cuenta en CloudCore, puedes ignorar este correo con tranquilidad — no se creará ninguna cuenta sin este código.
              </p>
            </td>
          </tr>

          <tr>
            <td bgcolor="#ffffff" style="padding:0 32px; background-color:#ffffff;">
              <hr style="border:none; border-top:1px solid #d0d7de; margin:0;" />
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" bgcolor="#ffffff" style="padding:20px 32px 32px; background-color:#ffffff;">
              <p style="margin:0; font-size:12px; color:#8b949e;">
                Este es un mensaje automático de CloudCore — Infraestructura SaaS de alto rendimiento.<br/>
                Por favor no respondas a este correo.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
function escapeHtml(s) {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
//# sourceMappingURL=verification-email.template.js.map