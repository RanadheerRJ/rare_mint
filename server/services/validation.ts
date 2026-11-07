/** HTTP-mapped error thrown by services and turned into JSON by routes. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const badRequest = (message: string): ApiError => new ApiError(400, message);
export const unauthorized = (message: string): ApiError => new ApiError(401, message);
export const forbidden = (message: string): ApiError => new ApiError(403, message);
export const notFound = (message: string): ApiError => new ApiError(404, message);
export const conflict = (message: string): ApiError => new ApiError(409, message);

export function requireText(value: unknown, field: string, maxLength = 200): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw badRequest(`${field} is required.`);
  if (text.length > maxLength) throw badRequest(`${field} must be at most ${maxLength} characters.`);
  return text;
}

export function optionalText(value: unknown, field: string, maxLength = 500): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw badRequest(`${field} must be text.`);
  const text = value.trim();
  if (text.length > maxLength) throw badRequest(`${field} must be at most ${maxLength} characters.`);
  return text;
}

/** Returns the 10-digit phone or throws 400. */
export function requirePhone(value: unknown, field = 'Phone'): string {
  const digits = (typeof value === 'string' || typeof value === 'number' ? String(value) : '').replace(/\D/g, '');
  if (digits.length !== 10) throw badRequest(`${field} must be exactly 10 digits.`);
  return digits;
}

/** Returns the 4-digit PIN or throws 400. */
export function requirePin(value: unknown, field = 'PIN'): string {
  const pin = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  if (!/^\d{4}$/.test(pin)) throw badRequest(`${field} must be exactly 4 digits.`);
  return pin;
}

export function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Returns a YYYY-MM-DD date or throws 400. */
export function requireDate(value: unknown, field: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!isValidDateString(text)) throw badRequest(`${field} must be a valid date in YYYY-MM-DD format.`);
  return text;
}

export function optionalDate(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return requireDate(value, field);
}

/** Returns a positive integer or throws 400. */
export function requirePositiveInt(value: unknown, field: string): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(num) || num <= 0) throw badRequest(`${field} must be a positive integer.`);
  return num;
}

export function optionalPositiveInt(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return requirePositiveInt(value, field);
}

/** Returns an integer within [min, max] or throws 400. */
export function requireIntInRange(value: unknown, field: string, min: number, max: number): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(num) || num < min || num > max) {
    throw badRequest(`${field} must be an integer between ${min} and ${max}.`);
  }
  return num;
}

export function optionalIntInRange(
  value: unknown,
  field: string,
  min: number,
  max: number
): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return requireIntInRange(value, field, min, max);
}

/** Returns a number within [min, max] or throws 400. */
export function requireNumberInRange(value: unknown, field: string, min: number, max: number): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || num < min || num > max) {
    throw badRequest(`${field} must be a number between ${min} and ${max}.`);
  }
  return num;
}

export function optionalNumberInRange(
  value: unknown,
  field: string,
  min: number,
  max: number
): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return requireNumberInRange(value, field, min, max);
}

export const PAYMENT_METHODS = ['UPI', 'CASH', 'BANK_TRANSFER', 'CHEQUE'] as const;

export function requirePaymentMethod(value: unknown): (typeof PAYMENT_METHODS)[number] {
  const text = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!(PAYMENT_METHODS as readonly string[]).includes(text)) {
    throw badRequest(`Payment method must be one of: ${PAYMENT_METHODS.join(', ')}.`);
  }
  return text as (typeof PAYMENT_METHODS)[number];
}
