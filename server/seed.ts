import { repositories } from './repositories';
import { hashPin } from './auth/passwords';

/**
 * Seeds the platform developer from DEV_PHONE / DEV_PIN / DEV_NAME (upsert).
 * This is the ONLY way a developer account is ever created — there is no UI
 * or public API path for it. If the env vars are missing or invalid, a warning
 * is logged and no developer is created.
 */
export function seedDeveloperFromEnv(): void {
  const phone = (process.env.DEV_PHONE ?? '').replace(/\D/g, '');
  const pin = (process.env.DEV_PIN ?? '').trim();
  const name = (process.env.DEV_NAME ?? '').trim();

  const problems: string[] = [];
  if (phone.length !== 10) problems.push('DEV_PHONE (10 digits)');
  if (!/^\d{4}$/.test(pin)) problems.push('DEV_PIN (4 digits)');
  if (!name) problems.push('DEV_NAME');
  if (problems.length > 0) {
    console.warn(
      `[rare-mint] No developer account seeded: ${problems.join(', ')} missing or invalid. ` +
        'Set DEV_PHONE, DEV_PIN and DEV_NAME to enable the developer dashboard.'
    );
    return;
  }

  const { hash, salt } = hashPin(pin);
  const developer = repositories.users.upsertDeveloper({ name, phone, pinHash: hash, pinSalt: salt });
  console.log(`[rare-mint] Developer account ready: ${developer.name} (+91 ${developer.phone})`);
}
