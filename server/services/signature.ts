import crypto from 'node:crypto';

/** Deterministic receipt signature hash shared by records and re-issued copies. */
export function makeSignatureHash(receiptNo: string, slotId: number, month: number, amount: number): string {
  const digest = crypto
    .createHash('sha256')
    .update(`${receiptNo}:${slotId}:${month}:${amount}:RAREMINT`)
    .digest('hex')
    .slice(0, 8)
    .toUpperCase();
  return `RM-SIG-${digest}`;
}
