import { formatDateDO } from "../utils/date.js";
import { formatDop } from "../utils/money.js";

type QuotePdfLine = {
  productName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  subtotal: number;
};

type QuotePdfData = {
  business: {
    name: string;
    rnc?: string | null;
    phone?: string | null;
    address?: string | null;
    logoUrl?: string | null;
  };
  quote: {
    quoteNumber: string;
    createdAt: Date;
    validUntil?: Date | null;
    subtotal: number;
    taxRate: number;
    taxAmount: number;
    total: number;
  };
  customer: {
    name?: string | null;
    phone: string;
  };
  lines: QuotePdfLine[];
};

function escapeHtml(value: string | null | undefined): string {
  if (!value) return "";

  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function buildQuoteHtml(data: QuotePdfData): string {
  const businessName = escapeHtml(data.business.name);
  const customerName = escapeHtml(data.customer.name || "Cliente");

  const rows = data.lines
    .map((line, index) => {
      return `
        <tr>
          <td class="center">${index + 1}</td>
          <td>
            <strong>${escapeHtml(line.productName)}</strong>
            <div class="muted">${escapeHtml(line.unit)}</div>
          </td>
          <td class="right">${line.quantity}</td>
          <td class="right">${formatDop(line.unitPrice)}</td>
          <td class="right">${formatDop(line.subtotal)}</td>
        </tr>
      `;
    })
    .join("");

  const logoHtml = data.business.logoUrl
    ? `<img class="logo" src="${escapeHtml(data.business.logoUrl)}" />`
    : `<div class="logo-placeholder">${businessName.charAt(0)}</div>`;

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Cotización ${escapeHtml(data.quote.quoteNumber)}</title>
  <style>
    * {
      box-sizing: border-box;
    }

    body {
      font-family: Arial, Helvetica, sans-serif;
      margin: 0;
      padding: 32px;
      color: #1f2937;
      background: #ffffff;
      font-size: 13px;
    }

    .page {
      width: 100%;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 4px solid #f97316;
      padding-bottom: 18px;
      margin-bottom: 24px;
    }

    .business {
      display: flex;
      gap: 14px;
      align-items: center;
    }

    .logo {
      width: 70px;
      height: 70px;
      object-fit: contain;
    }

    .logo-placeholder {
      width: 70px;
      height: 70px;
      background: #f97316;
      color: white;
      font-size: 34px;
      font-weight: 800;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 14px;
    }

    h1, h2, h3, p {
      margin: 0;
    }

    .business-name {
      font-size: 22px;
      font-weight: 800;
      color: #111827;
    }

    .muted {
      color: #6b7280;
      font-size: 12px;
      margin-top: 3px;
    }

    .quote-title {
      text-align: right;
    }

    .quote-title h1 {
      font-size: 28px;
      color: #f97316;
      letter-spacing: 1px;
    }

    .quote-number {
      font-size: 14px;
      font-weight: 700;
      color: #111827;
      margin-top: 6px;
    }

    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 18px;
      margin-bottom: 24px;
    }

    .card {
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 16px;
      background: #fafafa;
    }

    .card-title {
      font-size: 12px;
      font-weight: 800;
      color: #f97316;
      text-transform: uppercase;
      letter-spacing: .6px;
      margin-bottom: 10px;
    }

    .line {
      margin-bottom: 6px;
    }

    .line strong {
      color: #111827;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 12px;
    }

    thead {
      background: #111827;
      color: white;
    }

    th {
      padding: 11px 10px;
      text-align: left;
      font-size: 12px;
      text-transform: uppercase;
    }

    td {
      padding: 12px 10px;
      border-bottom: 1px solid #e5e7eb;
      vertical-align: top;
    }

    .center {
      text-align: center;
    }

    .right {
      text-align: right;
    }

    .totals {
      width: 320px;
      margin-left: auto;
      margin-top: 20px;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      overflow: hidden;
    }

    .totals-row {
      display: flex;
      justify-content: space-between;
      padding: 11px 14px;
      border-bottom: 1px solid #e5e7eb;
    }

    .totals-row:last-child {
      border-bottom: none;
    }

    .total-final {
      background: #f97316;
      color: white;
      font-weight: 800;
      font-size: 16px;
    }

    .note {
      margin-top: 28px;
      padding: 14px;
      background: #fff7ed;
      border-left: 4px solid #f97316;
      color: #7c2d12;
      border-radius: 8px;
    }

    .footer {
      margin-top: 38px;
      padding-top: 14px;
      border-top: 1px solid #e5e7eb;
      font-size: 11px;
      color: #6b7280;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="business">
        ${logoHtml}
        <div>
          <div class="business-name">${businessName}</div>
          <div class="muted">RNC: ${escapeHtml(data.business.rnc || "N/A")}</div>
          <div class="muted">Tel: ${escapeHtml(data.business.phone || "N/A")}</div>
          <div class="muted">${escapeHtml(data.business.address || "")}</div>
        </div>
      </div>

      <div class="quote-title">
        <h1>COTIZACIÓN</h1>
        <div class="quote-number">${escapeHtml(data.quote.quoteNumber)}</div>
        <div class="muted">Fecha: ${formatDateDO(data.quote.createdAt)}</div>
        <div class="muted">Válida hasta: ${
          data.quote.validUntil ? formatDateDO(data.quote.validUntil) : "N/A"
        }</div>
      </div>
    </div>

    <div class="info-grid">
      <div class="card">
        <div class="card-title">Cliente</div>
        <div class="line"><strong>Nombre:</strong> ${customerName}</div>
        <div class="line"><strong>Teléfono:</strong> ${escapeHtml(data.customer.phone)}</div>
      </div>

      <div class="card">
        <div class="card-title">Resumen</div>
        <div class="line"><strong>Productos:</strong> ${data.lines.length}</div>
        <div class="line"><strong>Estado:</strong> Cotización generada</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th class="center">#</th>
          <th>Producto</th>
          <th class="right">Cantidad</th>
          <th class="right">Precio</th>
          <th class="right">Subtotal</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>

    <div class="totals">
      <div class="totals-row">
        <span>Subtotal</span>
        <strong>${formatDop(data.quote.subtotal)}</strong>
      </div>
      <div class="totals-row">
        <span>ITBIS ${(data.quote.taxRate * 100).toFixed(0)}%</span>
        <strong>${formatDop(data.quote.taxAmount)}</strong>
      </div>
      <div class="totals-row total-final">
        <span>Total</span>
        <span>${formatDop(data.quote.total)}</span>
      </div>
    </div>

    <div class="note">
      Cotización válida por 24 horas. Precios sujetos a disponibilidad al momento de facturar.
    </div>

    <div class="footer">
      Documento generado automáticamente por el Agente IA de Ventas.
    </div>
  </div>
</body>
</html>
  `;
}