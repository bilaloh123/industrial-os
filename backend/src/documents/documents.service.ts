import { Injectable, NotFoundException } from '@nestjs/common';
import PDFDocument = require('pdfkit');
import { PrismaService } from '../prisma.service';

const INK = '#14171a';
const MUTED = '#6b7078';
const AMBER = '#c8871f'; // slightly darker than the UI amber, for print contrast
const LINE = '#dfe2e5';

function fmtMoney(n: number, currency = 'MAD') {
  return `${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} ${currency}`;
}
function fmtDate(d: Date | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR');
}

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------
  // CUSTOMER INVOICE PDF (Facture)
  // ---------------------------------------------------------------
  async buildInvoicePdf(companyId: string, invoiceId: string): Promise<Buffer> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, companyId },
      include: {
        customer: true,
        payments: true,
        salesOrder: { include: { items: { include: { product: true } } } },
      },
    });
    if (!invoice) throw new NotFoundException('الفاتورة غير موجودة');
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });

    const paid = invoice.payments.reduce((s: number, p: any) => s + p.amount, 0);
    const rows = invoice.salesOrder.items.map((item: any) => ({
      ref: item.product.internalRef,
      name: item.product.name,
      qty: item.quantity,
      unitPrice: item.unitPrice,
      total: item.quantity * item.unitPrice,
    }));

    return this.renderDocument({
      docTitle: 'FACTURE',
      docNumber: invoice.invoiceNumber,
      docDate: invoice.createdAt,
      dueDate: invoice.dueDate,
      company,
      partyLabel: 'Facturé à',
      partyName: invoice.customer.name,
      partyExtra: [invoice.customer.ice ? `ICE: ${invoice.customer.ice}` : null, invoice.customer.address].filter(Boolean) as string[],
      columns: ['Référence', 'Désignation', 'Qté', 'Prix unitaire', 'Total'],
      rows: rows.map((r: any) => [r.ref, r.name, String(r.qty), fmtMoney(r.unitPrice), fmtMoney(r.total)]),
      totalLabel: 'Total facture',
      total: invoice.totalAmount,
      extraTotals: [
        ['Montant payé', fmtMoney(paid)],
        ['Solde restant', fmtMoney(invoice.totalAmount - paid)],
      ],
      footerNote: `Statut: ${invoice.status} — Merci de votre confiance.`,
    });
  }

  // ---------------------------------------------------------------
  // PURCHASE ORDER PDF (Bon de commande)
  // ---------------------------------------------------------------
  async buildPurchaseOrderPdf(companyId: string, purchaseOrderId: string): Promise<Buffer> {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: purchaseOrderId, companyId },
      include: { supplier: true, items: { include: { product: true } } },
    });
    if (!po) throw new NotFoundException('طلب الشراء غير موجود');
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });

    const rows = po.items.map((item: any) => ({
      ref: item.product.internalRef,
      name: item.product.name,
      qty: item.quantityOrdered,
      unitCost: item.unitCost,
      total: item.quantityOrdered * item.unitCost,
    }));
    const total = rows.reduce((s: number, r: any) => s + r.total, 0);

    return this.renderDocument({
      docTitle: 'BON DE COMMANDE',
      docNumber: po.id,
      docDate: po.createdAt,
      dueDate: po.expectedDate,
      company,
      partyLabel: 'Fournisseur',
      partyName: po.supplier.name,
      partyExtra: [po.supplier.country, po.supplier.email].filter(Boolean) as string[],
      columns: ['Référence', 'Désignation', 'Qté', 'Coût unitaire', 'Total'],
      rows: rows.map((r: any) => [r.ref, r.name, String(r.qty), fmtMoney(r.unitCost, po.currency), fmtMoney(r.total, po.currency)]),
      totalLabel: 'Total commande',
      total,
      extraTotals: [],
      footerNote: `Statut: ${po.status} — Devise: ${po.currency}`,
      currency: po.currency,
    });
  }

  // ---------------------------------------------------------------
  // SHARED LAYOUT ENGINE — used by both document types so every PDF
  // produced by the system looks consistent (PHASE 47 Document Engine).
  // ---------------------------------------------------------------
  private renderDocument(opts: {
    docTitle: string;
    docNumber: string;
    docDate: Date;
    dueDate?: Date | null;
    company: { name: string; address?: string | null; ice?: string | null; ifNumber?: string | null; phone?: string | null; email?: string | null };
    partyLabel: string;
    partyName: string;
    partyExtra: string[];
    columns: string[];
    rows: string[][];
    totalLabel: string;
    total: number;
    extraTotals: [string, string][];
    footerNote: string;
    currency?: string;
  }): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const left = doc.page.margins.left;

      // ---- header band ----
      doc.rect(left, 50, pageWidth, 3).fill(AMBER);
      doc.moveDown(1.2);

      doc.fillColor(INK).font('Helvetica-Bold').fontSize(18).text('INDUSTRIAL', left, 70, { continued: true });
      doc.fillColor(AMBER).text(' OS');

      doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(opts.company.name, left, 95);
      const companyLines = [opts.company.address, opts.company.ice ? `ICE: ${opts.company.ice}` : null, opts.company.phone, opts.company.email]
        .filter(Boolean) as string[];
      let y = 108;
      for (const line of companyLines) {
        doc.text(line, left, y);
        y += 12;
      }

      // ---- doc title block (right side) ----
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(16).text(opts.docTitle, left, 70, { width: pageWidth, align: 'right' });
      doc.font('Helvetica').fontSize(9).fillColor(MUTED);
      doc.text(`N°: ${opts.docNumber}`, left, 95, { width: pageWidth, align: 'right' });
      doc.text(`Date: ${fmtDate(opts.docDate)}`, left, 108, { width: pageWidth, align: 'right' });
      if (opts.dueDate) doc.text(`Échéance: ${fmtDate(opts.dueDate)}`, left, 121, { width: pageWidth, align: 'right' });

      // ---- party block ----
      const partyY = Math.max(y, 145) + 15;
      doc.rect(left, partyY, pageWidth, 0.5).fill(LINE);
      doc.fillColor(MUTED).fontSize(8).text(opts.partyLabel.toUpperCase(), left, partyY + 10);
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(11).text(opts.partyName, left, partyY + 22);
      doc.font('Helvetica').fontSize(9).fillColor(MUTED);
      let py = partyY + 38;
      for (const line of opts.partyExtra) {
        doc.text(line, left, py);
        py += 12;
      }

      // ---- items table ----
      const tableTop = py + 20;
      const colWidths = [pageWidth * 0.18, pageWidth * 0.37, pageWidth * 0.1, pageWidth * 0.17, pageWidth * 0.18];
      let x = left;
      doc.rect(left, tableTop, pageWidth, 20).fill(INK);
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#ECEEF0');
      opts.columns.forEach((col, i) => {
        doc.text(col, x + 6, tableTop + 6, { width: colWidths[i] - 8, align: i >= 2 ? 'right' : 'left' });
        x += colWidths[i];
      });

      let rowY = tableTop + 20;
      doc.font('Helvetica').fontSize(9).fillColor(INK);
      opts.rows.forEach((row, idx) => {
        const rowHeight = 20;
        if (idx % 2 === 1) doc.rect(left, rowY, pageWidth, rowHeight).fill('#F7F8F9');
        doc.fillColor(INK);
        x = left;
        row.forEach((cell, i) => {
          doc.text(cell, x + 6, rowY + 6, { width: colWidths[i] - 8, align: i >= 2 ? 'right' : 'left' });
          x += colWidths[i];
        });
        rowY += rowHeight;
      });
      doc.rect(left, tableTop, pageWidth, rowY - tableTop).stroke(LINE);

      // ---- totals ----
      let totalsY = rowY + 15;
      const totalsX = left + pageWidth * 0.55;
      const totalsWidth = pageWidth * 0.45;

      for (const [label, value] of opts.extraTotals) {
        doc.font('Helvetica').fontSize(9.5).fillColor(MUTED).text(label, totalsX, totalsY, { width: totalsWidth * 0.5 });
        doc.fillColor(INK).text(value, totalsX + totalsWidth * 0.5, totalsY, { width: totalsWidth * 0.5, align: 'right' });
        totalsY += 16;
      }
      doc.rect(totalsX, totalsY, totalsWidth, 0.5).fill(LINE);
      totalsY += 8;
      doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(opts.totalLabel, totalsX, totalsY, { width: totalsWidth * 0.5 });
      doc.fillColor(AMBER).text(fmtMoney(opts.total, opts.currency), totalsX + totalsWidth * 0.5, totalsY, { width: totalsWidth * 0.5, align: 'right' });

      // ---- footer ----
      const footerY = doc.page.height - doc.page.margins.bottom - 40;
      doc.rect(left, footerY, pageWidth, 0.5).fill(LINE);
      doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(opts.footerNote, left, footerY + 10, { width: pageWidth });
      doc.text('Document généré par INDUSTRIAL OS', left, footerY + 22, { width: pageWidth, align: 'center' });

      doc.end();
    });
  }
}
