import { DueItem, PaymentRecord } from '../types';

const inrFormatter = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 0,
});

/**
 * Formats number in Indian Lakhs/Crores passbook style, e.g. ₹5,00,000/- or 37,000/-
 */
export function formatPassbookAmount(amount: number, withSymbol = true, withSlash = true): string {
  const rounded = Math.round(amount || 0);
  const absFormatted = inrFormatter.format(Math.abs(rounded));
  const sign = rounded < 0 ? '-' : '';
  const prefix = withSymbol ? '₹' : '';
  const suffix = withSlash ? '/-' : '';
  return `${sign}${prefix}${absFormatted}${suffix}`;
}

export function formatINR(amount: number): string {
  return formatPassbookAmount(amount, true, false);
}

export function formatCompactINR(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 10000000) {
    return `${sign}₹${(abs / 10000000).toFixed(2)} Cr`;
  }
  if (abs >= 100000) {
    return `${sign}₹${(abs / 100000).toFixed(2)} L`;
  }
  return `${sign}₹${inrFormatter.format(Math.round(abs))}`;
}

export function formatIndianDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts.map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatShortDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts.map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
  });
}

export function normalizeIndianPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  return digits;
}

export function buildReceiptWhatsAppText(receipt: PaymentRecord): string {
  return [
    `*RARE MINT — OFFICIAL CHIT RECEIPT*`,
    `Receipt No: *${receipt.receiptNumber}*`,
    `Chit Group: *${receipt.chitName || receipt.chitCode}*`,
    `Member: *${receipt.memberName}* (Ticket #${receipt.ticketNumber})`,
    `Installment Month: *Month ${receipt.monthNumber}*`,
    `Amount Paid: *${formatPassbookAmount(receipt.amountPaid)}*`,
    `Payment Mode: ${receipt.paymentMethod.replace('_', ' ')}`,
    `Paid Date: ${formatIndianDate(receipt.paidDate)}`,
    `Signed By: ${receipt.signedByName} (${receipt.signatureHash})`,
    `Thank you for your timely payment.`,
  ].join('\n');
}

export function buildDueReminderWhatsAppText(due: DueItem): string {
  const statusLine = due.isOverdue
    ? `Status: *Overdue since ${formatIndianDate(due.dueDate)}*`
    : `Due Date: *${formatIndianDate(due.dueDate)}*`;

  return [
    `Namaste *${due.memberName}*,`,
    `Gentle reminder from *Rare Mint Chit Desk* (${due.organizerName}):`,
    `Chit Group: *${due.chitName}* (${due.chitCode})`,
    `Ticket #${due.ticketNumber} (${due.isPrizedSubscriber ? 'Prized Subscriber' : 'Non-Prized Subscriber'})`,
    `Installment: *Month ${due.monthNumber}*`,
    `Amount Payable: *${formatPassbookAmount(due.amountDue)}*`,
    statusLine,
    `Kindly complete payment via UPI/Cash and collect your digital passbook signature.`,
  ].join('\n');
}

export function buildWhatsAppLink(phone: string, text: string): string {
  const normalized = normalizeIndianPhone(phone);
  return `https://wa.me/${normalized}?text=${encodeURIComponent(text)}`;
}
