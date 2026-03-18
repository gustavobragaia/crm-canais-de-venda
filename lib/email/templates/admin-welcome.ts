const LOGO_SVG = `<svg width="36" height="36" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M 358.4 102.4 A 153.6 153.6 0 0 1 435.2 256 A 153.6 153.6 0 0 1 358.4 409.6" stroke="white" stroke-width="51.2" stroke-linecap="round" fill="none"/><circle cx="204.8" cy="256" r="153.6" stroke="white" stroke-width="51.2" fill="none"/></svg>`

export function adminWelcomeEmail({
  adminName,
  adminEmail,
  adminPassword,
  workspaceName,
  workspaceSlug,
  loginUrl,
}: {
  adminName: string
  adminEmail: string
  adminPassword: string
  workspaceName: string
  workspaceSlug: string
  loginUrl: string
}) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bem-vindo ao ClosioCRM</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:#2b7fff;border-radius:16px 16px 0 0;padding:28px 40px;text-align:center;">
              <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td style="vertical-align:middle;padding-right:10px;">${LOGO_SVG}</td>
                  <td style="vertical-align:middle;">
                    <span style="color:white;font-size:22px;font-weight:700;letter-spacing:-0.5px;">ClosioCRM</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#ffffff;padding:40px 40px 32px;border-left:1px solid #e8edf2;border-right:1px solid #e8edf2;">
              <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#111827;">Bem-vindo ao ClosioCRM, ${adminName}!</h1>
              <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
                Você realmente priorizou o atendimento e organização da sua equipe, e esse é um dos pilares de organização dos processos.
              </p>

              <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">
                Seu workspace <strong style="color:#111827;">${workspaceName}</strong> está pronto. Acesse sua conta com as credenciais abaixo:
              </p>

              <!-- Credentials box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:28px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding-bottom:12px;border-bottom:1px solid #e2e8f0;">
                          <span style="font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">Workspace</span><br/>
                          <span style="font-size:15px;font-weight:600;color:#111827;margin-top:2px;display:block;">${workspaceSlug}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:12px 0;border-bottom:1px solid #e2e8f0;">
                          <span style="font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">Login (Email)</span><br/>
                          <span style="font-size:15px;font-weight:600;color:#111827;margin-top:2px;display:block;">${adminEmail}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-top:12px;">
                          <span style="font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;">Senha temporária</span><br/>
                          <span style="font-size:15px;font-weight:700;color:#2b7fff;font-family:monospace;letter-spacing:1px;margin-top:2px;display:block;">${adminPassword}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${loginUrl}" style="display:inline-block;background:#2b7fff;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 36px;border-radius:10px;letter-spacing:0.2px;">
                      Acessar minha conta
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;text-align:center;line-height:1.5;">
                Recomendamos que você altere sua senha após o primeiro acesso.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;border:1px solid #e8edf2;border-top:none;border-radius:0 0 16px 16px;padding:20px 40px;text-align:center;">
              <table cellpadding="0" cellspacing="0" style="margin:0 auto 8px;">
                <tr>
                  <td style="vertical-align:middle;padding-right:7px;">
                    <svg width="20" height="20" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M 358.4 102.4 A 153.6 153.6 0 0 1 435.2 256 A 153.6 153.6 0 0 1 358.4 409.6" stroke="#2b7fff" stroke-width="51.2" stroke-linecap="round" fill="none"/><circle cx="204.8" cy="256" r="153.6" stroke="#2b7fff" stroke-width="51.2" fill="none"/></svg>
                  </td>
                  <td style="vertical-align:middle;">
                    <span style="font-size:14px;font-weight:700;color:#374151;">ClosioCRM</span>
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                Você recebeu este email porque criou uma conta no ClosioCRM.<br/>
                &copy; ${new Date().getFullYear()} ClosioCRM. Todos os direitos reservados.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
