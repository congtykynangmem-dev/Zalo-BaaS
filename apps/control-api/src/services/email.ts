// apps/control-api/src/services/email.ts
import { nanoid } from 'nanoid';
import type { D1Database } from '@cloudflare/workers-types';

export interface WebsiteContactSettings {
  company_name: string;
  brand_name: string;
  hotline: string;
  contact_email: string;
  address: string;
  working_hours: string;
  website_url: string;
  zalo_oa_url?: string;
}

export interface BankAccountSettings {
  bank_id: string;
  bank_name: string;
  account_no: string;
  account_name: string;
}

export interface EmailConfigSettings {
  sender_email: string;
  sender_name: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass: string;
  auto_send_on_payment: boolean;
}

export const DEFAULT_CONTACT_SETTINGS: WebsiteContactSettings = {
  company_name: 'CÔNG TY TNHH KỸ NĂNG MỀM',
  brand_name: 'Zalo BaaS',
  hotline: '0986.000.797',
  contact_email: 'congtykynangmem@gmail.com',
  address: 'Số 41 Trần Phú, Phường Phước Hậu, TP. Vĩnh Long, Tỉnh Vĩnh Long',
  working_hours: '08:00 – 21:00 hàng ngày (Hỗ trợ 24/7)',
  website_url: 'https://bot.knm.asia',
  zalo_oa_url: 'https://zalo.me/0986000797',
};

export const DEFAULT_BANK_SETTINGS: BankAccountSettings = {
  bank_id: 'MB',
  bank_name: 'Ngân hàng Quân Đội (MBBank)',
  account_no: '0986000797',
  account_name: 'CONG TY KY NANG MEM',
};

export const DEFAULT_EMAIL_CONFIG: EmailConfigSettings = {
  sender_email: 'congtykynangmem@gmail.com',
  sender_name: 'Zalo BaaS - Kỹ Năng Mềm',
  smtp_host: 'smtp.gmail.com',
  smtp_port: 465,
  smtp_user: 'congtykynangmem@gmail.com',
  smtp_pass: '',
  auto_send_on_payment: true,
};

/**
 * Load system settings from database with safe fallback defaults
 */
export async function getSystemSettings(db: D1Database): Promise<{
  contact: WebsiteContactSettings;
  bank: BankAccountSettings;
  email: EmailConfigSettings;
}> {
  try {
    const rows = await db
      .prepare('SELECT key, value FROM system_settings WHERE key IN (?, ?, ?)')
      .bind('website_contact', 'bank_account', 'email_config')
      .all<{ key: string; value: string }>();

    let contact = { ...DEFAULT_CONTACT_SETTINGS };
    let bank = { ...DEFAULT_BANK_SETTINGS };
    let email = { ...DEFAULT_EMAIL_CONFIG };

    for (const row of rows.results || []) {
      try {
        const parsed = JSON.parse(row.value);
        if (row.key === 'website_contact') contact = { ...contact, ...parsed };
        if (row.key === 'bank_account') bank = { ...bank, ...parsed };
        if (row.key === 'email_config') email = { ...email, ...parsed };
      } catch {}
    }

    return { contact, bank, email };
  } catch (err) {
    return {
      contact: DEFAULT_CONTACT_SETTINGS,
      bank: DEFAULT_BANK_SETTINGS,
      email: DEFAULT_EMAIL_CONFIG,
    };
  }
}

/**
 * Encode non-ASCII header text as RFC 2047 UTF-8 Base64 encoded-word
 */
export function encodeMimeWord(text: string): string {
  const clean = text.trim();
  if (!clean) return '';
  if (/^[\x20-\x7E]+$/.test(clean)) {
    return clean.includes('"') ? `"${clean.replace(/"/g, '\\"')}"` : `"${clean}"`;
  }
  return `=?UTF-8?B?${Buffer.from(clean, 'utf-8').toString('base64')}?=`;
}

/**
 * Wrap Base64 body at 76 chars per line (RFC 2045) to satisfy SMTP 998-char line limit
 */
export function wrapBase64Lines(base64: string, width = 76): string {
  const chunks: string[] = [];
  for (let i = 0; i < base64.length; i += width) {
    chunks.push(base64.slice(i, i + width));
  }
  return chunks.join('\r\n');
}

/**
 * Normalize Gmail App Password / SMTP password (removes spaces copied from Google security page)
 */
export function normalizeSmtpPassword(pass: string): string {
  return (pass || '').replace(/\s+/g, '').trim();
}

/**
 * Validate Gmail App Password format (16 characters when using smtp.gmail.com)
 */
export function validateGmailAppPassword(host: string, pass: string): string | null {
  const cleanHost = (host || 'smtp.gmail.com').toLowerCase().trim();
  const cleanPass = normalizeSmtpPassword(pass);
  if (!cleanPass) return null;
  if (cleanHost.includes('gmail.com') && cleanPass.length !== 16) {
    return `Mật khẩu ứng dụng Gmail (App Password) phải có đúng 16 ký tự (hiện tại đang có ${cleanPass.length} ký tự — đây có thể là mật khẩu đăng nhập thường hoặc bị trình duyệt tự điền). Vui lòng vào Tài khoản Google → Bảo mật → Xác minh 2 bước → Mật khẩu ứng dụng để tạo mã 16 ký tự và dán lại.`;
  }
  return null;
}

/**
 * Build RFC 5322 / RFC 2045 MIME message payload for SMTP DATA command
 */
export function buildSmtpMimePayload(options: {
  from: string;
  fromName: string;
  to: string;
  subject: string;
  html: string;
}): string {
  const encodedFromName = encodeMimeWord(options.fromName);
  const encodedSubject = `=?UTF-8?B?${Buffer.from(options.subject, 'utf-8').toString('base64')}?=`;
  const domain = options.from.includes('@') ? options.from.split('@')[1] : 'zalo-baas.local';
  const messageId = `<${nanoid(16)}.${Date.now()}@${domain}>`;
  const bodyBase64 = wrapBase64Lines(Buffer.from(options.html, 'utf-8').toString('base64'));

  return [
    `From: ${encodedFromName ? `${encodedFromName} <${options.from}>` : `<${options.from}>`}`,
    `To: <${options.to}>`,
    `Subject: ${encodedSubject}`,
    `Message-ID: ${messageId}`,
    `Date: ${new Date().toUTCString()}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    bodyBase64,
    `.`,
    ``,
  ].join('\r\n');
}

/**
 * Map cryptic SMTP errors to actionable Vietnamese troubleshooting hints
 */
function formatSmtpError(code: number, rawLine: string): string {
  const lower = rawLine.toLowerCase();
  if (code === 535 || lower.includes('username and password not accepted') || lower.includes('badcredentials')) {
    return `Xác thực Gmail/SMTP thất bại (535): Sai email hoặc Mật khẩu ứng dụng (App Password). Lưu ý phải bật Xác minh 2 bước và dùng App Password 16 ký tự từ Google Account (${rawLine}).`;
  }
  if (code === 534 || lower.includes('application-specific password')) {
    return `Tài khoản Google yêu cầu Mật khẩu ứng dụng (App Password 16 ký tự) thay cho mật khẩu thường (${rawLine}).`;
  }
  return `SMTP error ${code}: ${rawLine}`;
}

/**
 * Pure TLS / STARTTLS SMTP sender using standard Node.js node:tls and node:net sockets.
 * Handles multi-line SMTP responses (e.g. 250- vs 250 ), RFC 2047 UTF-8 From header,
 * 76-char Base64 body line wrapping, port 465 (implicit TLS), and port 587 (STARTTLS).
 */
async function sendViaSmtpTls(options: {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  fromName: string;
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: boolean; error?: string }> {
  const cleanUser = (options.user || options.from || '').trim();
  const cleanPass = normalizeSmtpPassword(options.pass);
  const cleanFrom = (options.from || cleanUser).trim();
  const cleanTo = (options.to || '').trim();
  const host = (options.host || 'smtp.gmail.com').trim();
  const port = Number(options.port) || 465;

  if (!cleanPass) {
    return { ok: false, error: 'Chưa nhập Mật khẩu ứng dụng Gmail (SMTP Password).' };
  }

  const gmailPassErr = validateGmailAppPassword(host, cleanPass);
  if (gmailPassErr) {
    return { ok: false, error: gmailPassErr };
  }

  try {
    // Dynamic import to prevent Cloudflare Worker bundler issues when unused
    const tlsModule = await (Function('return import("node:tls")')() as Promise<any>);
    const netModule = await (Function('return import("node:net")')() as Promise<any>);
    if (!tlsModule || typeof tlsModule.connect !== 'function') {
      return { ok: false, error: 'Môi trường hiện tại không hỗ trợ node:tls để kết nối SMTP.' };
    }

    const useStartTls = port === 587 || port === 25 || port === 2525;

    return await new Promise((resolve) => {
      let settled = false;
      const done = (result: { ok: boolean; error?: string }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutHandle);
        resolve(result);
      };

      const timeoutHandle = setTimeout(() => {
        try {
          activeSocket?.destroy();
        } catch {}
        done({
          ok: false,
          error: `Quá thời gian kết nối SMTP (${host}:${port}). Vui lòng kiểm tra tường lửa/mạng hoặc thử đổi cổng 465 / 587.`,
        });
      }, 15000);

      let step = 0;
      let startTlsUpgraded = !useStartTls;
      let buffer = '';
      let errorLines: string[] = [];
      let activeSocket: any = null;

      const attachSocketHandlers = (sock: any) => {
        activeSocket = sock;
        sock.on('data', (data: Buffer) => {
          buffer += data.toString('utf-8');
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || '';

          for (const rawLine of lines) {
            if (!rawLine) continue;
            const code = parseInt(rawLine.slice(0, 3), 10);
            if (isNaN(code)) continue;

            // Multi-line SMTP continuation lines have '-' at index 3 (e.g. "250-SIZE ..." or "534-5.7.9 ..."); wait for final line
            const isContinuation = rawLine.length >= 4 && rawLine[3] === '-';
            if (code >= 400) {
              errorLines.push(rawLine.trim());
              if (isContinuation) {
                continue;
              }
              const fullErrLine = errorLines.join(' ');
              errorLines = [];
              try {
                sock.end();
              } catch {}
              done({ ok: false, error: formatSmtpError(code, fullErrLine) });
              return;
            }
            errorLines = [];
            if (isContinuation) {
              continue;
            }

            if (step === 0 && code === 220) {
              step = 1;
              sock.write(`EHLO localhost\r\n`);
            } else if (step === 1 && code === 250) {
              if (!startTlsUpgraded) {
                step = 10;
                sock.write(`STARTTLS\r\n`);
              } else {
                step = 2;
                sock.write(`AUTH LOGIN\r\n`);
              }
            } else if (step === 10 && code === 220) {
              startTlsUpgraded = true;
              buffer = '';
              sock.removeAllListeners('data');
              sock.removeAllListeners('error');
              sock.removeAllListeners('close');
              const tlsSock = tlsModule.connect({
                socket: sock,
                servername: host,
                rejectUnauthorized: false,
              });
              attachSocketHandlers(tlsSock);
              step = 11;
              tlsSock.once('secureConnect', () => {
                tlsSock.write(`EHLO localhost\r\n`);
              });
              return;
            } else if (step === 11 && code === 250) {
              step = 2;
              sock.write(`AUTH LOGIN\r\n`);
            } else if (step === 2 && code === 334) {
              step = 3;
              sock.write(`${Buffer.from(cleanUser, 'utf-8').toString('base64')}\r\n`);
            } else if (step === 3 && code === 334) {
              step = 4;
              sock.write(`${Buffer.from(cleanPass, 'utf-8').toString('base64')}\r\n`);
            } else if (step === 4 && code === 235) {
              step = 5;
              sock.write(`MAIL FROM:<${cleanFrom}>\r\n`);
            } else if (step === 5 && code === 250) {
              step = 6;
              sock.write(`RCPT TO:<${cleanTo}>\r\n`);
            } else if (step === 6 && code === 250) {
              step = 7;
              sock.write(`DATA\r\n`);
            } else if (step === 7 && code === 354) {
              step = 8;
              const payload = buildSmtpMimePayload({
                from: cleanFrom,
                fromName: options.fromName || 'Zalo BaaS',
                to: cleanTo,
                subject: options.subject,
                html: options.html,
              });
              sock.write(payload);
            } else if (step === 8 && code === 250) {
              step = 9;
              try {
                sock.write(`QUIT\r\n`);
                sock.end();
              } catch {}
              done({ ok: true });
              return;
            }
          }
        });

        sock.on('error', (err: any) => {
          done({
            ok: false,
            error: `Lỗi kết nối SMTP (${host}:${port}): ${err?.message || 'SMTP Socket error'}`,
          });
        });

        sock.on('close', () => {
          if (!settled && step !== 9) {
            if (errorLines.length > 0) {
              const code = parseInt(errorLines[0].slice(0, 3), 10) || 500;
              done({ ok: false, error: formatSmtpError(code, errorLines.join(' ')) });
              return;
            }
            done({
              ok: false,
              error: `Máy chủ SMTP (${host}:${port}) đã đóng kết nối đột ngột ở bước ${step}. Vui lòng kiểm tra cổng 465/587 và App Password.`,
            });
          }
        });
      };

      if (useStartTls) {
        if (!netModule || typeof netModule.connect !== 'function') {
          done({ ok: false, error: 'Không thể khởi tạo node:net cho cổng STARTTLS (587).' });
          return;
        }
        const netSocket = netModule.connect({ host, port });
        attachSocketHandlers(netSocket);
      } else {
        const tlsSocket = tlsModule.connect({
          host,
          port,
          servername: host,
          rejectUnauthorized: false,
        });
        attachSocketHandlers(tlsSocket);
      }
    });
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unknown SMTP exception' };
  }
}

/**
 * Generate formatted HTML email template for Payment Confirmation
 */
export function buildPaymentEmailHtml(params: {
  tenantName: string;
  toEmail: string;
  planName: string;
  amountVnd: number;
  days: number;
  expiresAt: number;
  invoiceId: string;
  contact: WebsiteContactSettings;
  bank: BankAccountSettings;
}): string {
  const { tenantName, toEmail, planName, amountVnd, days, expiresAt, invoiceId, contact, bank } = params;

  return `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Xác nhận thanh toán thành công - Zalo BaaS</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; color: #1e293b; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; }
    .header { background: linear-gradient(135deg, #2563eb, #4f46e5); padding: 32px 24px; text-align: center; color: #ffffff; }
    .header h1 { margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px; }
    .header p { margin: 6px 0 0; font-size: 13px; color: #dbeafe; }
    .content { padding: 28px 24px; }
    .greeting { font-size: 15px; font-weight: 600; margin-bottom: 12px; }
    .badge { display: inline-block; background-color: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 700; text-transform: uppercase; margin-bottom: 16px; }
    .table-card { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 20px; }
    .table-title { font-size: 13px; font-weight: 700; color: #0f172a; margin-bottom: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
    .info-row { display: flex; justify-content: space-between; font-size: 13px; padding: 6px 0; border-bottom: 1px dashed #e2e8f0; }
    .info-row:last-child { border-bottom: none; }
    .info-label { color: #64748b; }
    .info-value { font-weight: 600; color: #0f172a; text-align: right; }
    .cta-btn { display: block; width: fit-content; margin: 24px auto; background-color: #2563eb; color: #ffffff !important; text-decoration: none; padding: 12px 32px; border-radius: 12px; font-weight: 700; font-size: 14px; text-align: center; }
    .footer { background-color: #0f172a; color: #94a3b8; padding: 24px; font-size: 12px; line-height: 1.6; }
    .footer strong { color: #ffffff; }
    .highlight { color: #059669; font-weight: 700; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Zalo BaaS (bot.knm.asia)</h1>
      <p>Nền tảng Tự động hóa Zalo Bot AI - CÔNG TY TNHH KỸ NĂNG MỀM</p>
    </div>

    <div class="content">
      <div class="greeting">Kính gửi Quý khách / ${tenantName},</div>
      <div class="badge">✓ Đã nhận thanh toán thành công</div>

      <p style="font-size: 13px; line-height: 1.6; color: #475569; margin-top: 0;">
        Chúng tôi trân trọng thông báo hệ thống đã ghi nhận thành công giao dịch thanh toán nâng cấp/gia hạn gói cước Zalo Bot AI của Quý khách. Tài khoản của Quý khách đã được kích hoạt đầy đủ quyền lợi dịch vụ.
      </p>

      <!-- Giao dịch -->
      <div class="table-card">
        <div class="table-title">CHI TIẾT THANH TOÁN</div>
        <table style="width: 100%; font-size: 13px;">
          <tr>
            <td style="color: #64748b; padding: 5px 0;">Mã hóa đơn:</td>
            <td style="text-align: right; font-weight: 600; font-family: monospace;">${invoiceId}</td>
          </tr>
          <tr>
            <td style="color: #64748b; padding: 5px 0;">Số tiền đã thanh toán:</td>
            <td style="text-align: right; font-weight: 700; color: #059669; font-size: 14px;">${amountVnd.toLocaleString('vi-VN')} đ</td>
          </tr>
          <tr>
            <td style="color: #64748b; padding: 5px 0;">Tài khoản nhận tiền:</td>
            <td style="text-align: right; font-weight: 600;">${bank.bank_name || bank.bank_id} - ${bank.account_no}</td>
          </tr>
          <tr>
            <td style="color: #64748b; padding: 5px 0;">Chủ tài khoản:</td>
            <td style="text-align: right; font-weight: 600;">${bank.account_name}</td>
          </tr>
          <tr>
            <td style="color: #64748b; padding: 5px 0;">Thời gian giao dịch:</td>
            <td style="text-align: right; font-weight: 600;">${new Date().toLocaleString('vi-VN')}</td>
          </tr>
        </table>
      </div>

      <!-- Gói cước -->
      <div class="table-card">
        <div class="table-title">THÔNG TIN GÓI CƯỚC & THỜI HẠN SỬ DỤNG</div>
        <table style="width: 100%; font-size: 13px;">
          <tr>
            <td style="color: #64748b; padding: 5px 0;">Gói dịch vụ đăng ký:</td>
            <td style="text-align: right; font-weight: 700; color: #2563eb;">${planName}</td>
          </tr>
          <tr>
            <td style="color: #64748b; padding: 5px 0;">Thời gian gia hạn thêm:</td>
            <td style="text-align: right; font-weight: 600;">+${days} ngày</td>
          </tr>
          <tr>
            <td style="color: #64748b; padding: 5px 0;">Thời hạn sử dụng đến hết ngày:</td>
            <td style="text-align: right; font-weight: 700; color: #0f172a;">${new Date(expiresAt).toLocaleDateString('vi-VN')}</td>
          </tr>
          <tr>
            <td style="color: #64748b; padding: 5px 0;">Trạng thái tài khoản:</td>
            <td style="text-align: right; font-weight: 700; color: #059669;">Đang hoạt động (Paid)</td>
          </tr>
        </table>
      </div>

      <a href="${contact.website_url || 'https://bot.knm.asia'}/dashboard" class="cta-btn">
        Truy cập Bảng điều khiển Zalo BaaS →
      </a>

      <p style="font-size: 12px; color: #64748b; text-align: center; margin-bottom: 0;">
        Quý khách có thể bắt đầu kết nối Zalo Bot, nạp tài liệu vào Kho Tri Thức RAG và kích hoạt tư vấn tự động ngay bây giờ.
      </p>
    </div>

    <div class="footer">
      <div><strong>${contact.company_name}</strong></div>
      <div style="margin-top: 4px;">📍 Địa chỉ: ${contact.address}</div>
      <div style="margin-top: 2px;">📞 Hotline hỗ trợ: <strong style="color: #38bdf8;">${contact.hotline}</strong> | Giờ làm việc: ${contact.working_hours}</div>
      <div style="margin-top: 2px;">✉️ Email hỗ trợ: <strong style="color: #38bdf8;">${contact.contact_email}</strong></div>
      <div style="margin-top: 2px;">🌐 Website: <a href="${contact.website_url}" style="color: #38bdf8; text-decoration: none;">${contact.website_url}</a></div>
      <div style="margin-top: 10px; font-size: 11px; color: #64748b; border-top: 1px solid #1e293b; padding-top: 8px;">
        Email này được gửi tự động từ hệ thống quản trị Zalo BaaS (${contact.contact_email}). Quý khách vui lòng không trả lời trực tiếp email này.
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Dispatch payment success email and record to email_logs
 */
export async function sendPaymentSuccessEmail(
  db: D1Database,
  params: {
    tenantName: string;
    toEmail: string;
    planName: string;
    amountVnd: number;
    days: number;
    expiresAt: number;
    invoiceId: string;
    tenantId?: string;
    isTest?: boolean;
    configOverride?: Partial<EmailConfigSettings>;
  }
): Promise<{ ok: boolean; email_id: string; status: string; error?: string }> {
  const { contact, bank, email: storedEmailConfig } = await getSystemSettings(db);
  const emailConfig: EmailConfigSettings = params.configOverride
    ? { ...storedEmailConfig, ...params.configOverride }
    : storedEmailConfig;

  if (!params.isTest && emailConfig.auto_send_on_payment === false) {
    return {
      ok: true,
      email_id: `eml_skipped_${nanoid(10)}`,
      status: 'skipped',
    };
  }

  const emailId = `eml_${nanoid(16)}`;
  const now = Date.now();
  const subject = `[Zalo BaaS] Xác nhận thanh toán thành công - Gói cước ${params.planName} đã được kích hoạt`;
  const fromEmail = emailConfig.sender_email || 'congtykynangmem@gmail.com';
  const fromName = emailConfig.sender_name || 'Zalo BaaS - Kỹ Năng Mềm';

  const html = buildPaymentEmailHtml({
    tenantName: params.tenantName,
    toEmail: params.toEmail,
    planName: params.planName,
    amountVnd: params.amountVnd,
    days: params.days,
    expiresAt: params.expiresAt,
    invoiceId: params.invoiceId,
    contact,
    bank,
  });

  let deliveryStatus = 'simulated';
  let deliveryError: string | null = null;

  // If live SMTP App Password is provided in email settings, dispatch real email
  if (emailConfig.smtp_pass && emailConfig.smtp_pass.trim()) {
    try {
      const res = await sendViaSmtpTls({
        host: emailConfig.smtp_host || 'smtp.gmail.com',
        port: Number(emailConfig.smtp_port) || 465,
        user: emailConfig.smtp_user || fromEmail,
        pass: emailConfig.smtp_pass.trim(),
        from: fromEmail,
        fromName,
        to: params.toEmail,
        subject,
        html,
      });

      if (res.ok) {
        deliveryStatus = 'sent';
      } else {
        deliveryStatus = 'failed';
        deliveryError = res.error || 'SMTP delivery failed';
      }
    } catch (err: any) {
      deliveryStatus = 'failed';
      deliveryError = err?.message || 'SMTP exception';
    }
  } else {
    // Simulated/Recorded mode: clean fallback for dev/local or before entering Gmail App Password
    console.log(`[Email Service] Payment email rendered for ${params.toEmail} from ${fromEmail} (Stored in email_logs)`);
  }

  // Record in email_logs table
  try {
    const metadata = JSON.stringify({
      tenant_id: params.tenantId || null,
      invoice_id: params.invoiceId,
      plan_name: params.planName,
      amount_vnd: params.amountVnd,
      days: params.days,
      expires_at: params.expiresAt,
    });

    await db
      .prepare(
        'INSERT INTO email_logs (id, to_email, from_email, subject, content_html, status, error, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(emailId, params.toEmail, fromEmail, subject, html, deliveryStatus, deliveryError, metadata, now)
      .run();
  } catch (err) {
    console.warn('[Email Service] Failed to write into email_logs:', err);
  }

  return {
    ok: deliveryStatus !== 'failed',
    email_id: emailId,
    status: deliveryStatus,
    error: deliveryError || undefined,
  };
}

