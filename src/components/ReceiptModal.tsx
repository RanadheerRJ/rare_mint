import React, { useState } from 'react';
import { Check, Copy, MessageCircle, Printer, ShieldCheck, X } from 'lucide-react';
import { PaymentRecord } from '../types';
import {
  buildReceiptWhatsAppText,
  buildWhatsAppLink,
  formatIndianDate,
  formatPassbookAmount,
} from '../utils/format';

interface ReceiptModalProps {
  receipt: PaymentRecord | null;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ receipt, onClose }) => {
  const [copied, setCopied] = useState(false);

  if (!receipt) return null;

  const waText = buildReceiptWhatsAppText(receipt);
  const waUrl = buildWhatsAppLink(receipt.memberPhone || '', waText);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(waText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback ignored
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs">
      <div className="print-only-card relative w-full max-w-md overflow-hidden rounded-2xl border border-[#0B3B2E]/20 bg-[#FFFDF9] shadow-2xl">
        {/* Top Minted Header */}
        <div className="bg-[#0B3B2E] px-6 py-5 text-white">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#D4A437]/60 bg-[#135341] font-bold text-[#D4A437]">
                ₹
              </div>
              <div>
                <p className="text-[11px] font-semibold tracking-[0.16em] text-[#D4A437] uppercase">
                  Rare Mint Official Receipt
                </p>
                <h3 className="text-lg font-semibold tracking-tight">{receipt.receiptNumber}</h3>
              </div>
            </div>
            <button
              onClick={onClose}
              className="no-print rounded-lg p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white"
              aria-label="Close receipt"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Amount Banner */}
        <div className="border-b border-dashed border-[#0B3B2E]/20 bg-[#F4EFE4]/65 px-6 py-4 text-center">
          <p className="text-xs font-medium tracking-wider text-[#55655E] uppercase">
            Installment Received · Month {receipt.monthNumber}
          </p>
          <p className="mt-1 text-3xl font-bold tracking-tight text-[#0B3B2E] tabular-nums">
            {formatPassbookAmount(receipt.amountPaid)}
          </p>
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-0.5 text-xs font-semibold text-emerald-900">
            <ShieldCheck className="h-3.5 w-3.5" />
            Verified & Signed in Passbook
          </div>
        </div>

        {/* Ledger Details */}
        <div className="space-y-3 px-6 py-5 text-sm">
          <div className="flex justify-between border-b border-[#0B3B2E]/10 pb-2">
            <span className="text-[#55655E]">Chit Group</span>
            <span className="font-semibold text-right text-[#14201C]">
              {receipt.chitName || receipt.chitCode}
            </span>
          </div>
          <div className="flex justify-between border-b border-[#0B3B2E]/10 pb-2">
            <span className="text-[#55655E]">Subscriber & Ticket</span>
            <span className="font-semibold text-[#14201C]">
              {receipt.memberName} · Ticket #{receipt.ticketNumber}
            </span>
          </div>
          <div className="flex justify-between border-b border-[#0B3B2E]/10 pb-2">
            <span className="text-[#55655E]">Payment Date</span>
            <span className="font-medium text-[#14201C] tabular-nums">
              {formatIndianDate(receipt.paidDate)}
            </span>
          </div>
          <div className="flex justify-between border-b border-[#0B3B2E]/10 pb-2">
            <span className="text-[#55655E]">Payment Mode</span>
            <span className="font-medium text-[#14201C]">
              {receipt.paymentMethod.replace('_', ' ')}
              {receipt.referenceNote ? ` (${receipt.referenceNote})` : ''}
            </span>
          </div>

          {/* Digital Foreman Signature Box */}
          <div className="mt-4 flex items-center justify-between rounded-xl border border-[#D4A437]/40 bg-[#FAF6EC] px-4 py-3">
            <div>
              <p className="text-[11px] font-medium tracking-wider text-[#55655E] uppercase">
                Foreman Digital Signature
              </p>
              <p className="signature-stamp mt-0.5 text-base font-semibold text-[#0B3B2E]">
                {receipt.signedByName}
              </p>
            </div>
            <div className="text-right">
              <span className="inline-block rounded border border-[#0B3B2E]/25 bg-white px-2 py-0.5 font-mono text-[11px] font-semibold text-[#0B3B2E]">
                {receipt.signatureHash}
              </span>
              <p className="mt-1 text-[10px] text-[#55655E]">Passbook Stamp</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="no-print flex flex-col gap-2 border-t border-[#0B3B2E]/10 bg-[#FAF8F4] px-6 py-4 sm:flex-row sm:items-center">
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#0B3B2E] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#135341]"
          >
            <MessageCircle className="h-4 w-4" />
            WhatsApp Receipt
          </a>
          <button
            onClick={handleCopy}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-[#0B3B2E]/20 bg-white px-3.5 py-2.5 text-sm font-medium text-[#14201C] transition hover:bg-[#F4EFE4]"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-700" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-[#0B3B2E]/20 bg-white px-3.5 py-2.5 text-sm font-medium text-[#14201C] transition hover:bg-[#F4EFE4]"
          >
            <Printer className="h-4 w-4" />
            Print / PDF
          </button>
        </div>
      </div>
    </div>
  );
};
