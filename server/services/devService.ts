import type { AuthUser } from '../auth/types';
import { hashPin } from '../auth/passwords';
import type { OwnerSummary, Repositories, UserRecord } from '../repositories/types';
import type { PlatformStats, User } from '../../src/types';
import type { TransactionRunner } from '../repositories/sqlite/transaction';
import {
  badRequest,
  conflict,
  notFound,
  optionalText,
  requirePhone,
  requirePin,
  requireText,
} from './validation';

/** Public user shape; PIN hash/salt never leave the server. */
export function toPublicUser(user: UserRecord): User {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    role: user.role,
    city: user.city,
    createdAt: user.createdAt,
    isActive: user.isActive,
  };
}

export class DevService {
  constructor(
    private readonly repos: Repositories,
    private readonly tx: TransactionRunner
  ) {}

  private actorId(actor: AuthUser): number {
    return actor.id;
  }

  listOwners(): OwnerSummary[] {
    return this.repos.users.listOwners();
  }

  inviteOwner(
    actor: AuthUser,
    input: { name?: unknown; phone?: unknown; pin?: unknown; city?: unknown }
  ): OwnerSummary {
    const name = requireText(input.name, 'Name');
    const phone = requirePhone(input.phone);
    const pin = requirePin(input.pin);
    const city = optionalText(input.city, 'City') || 'Hyderabad';

    if (this.repos.users.findByPhone(phone)) {
      throw conflict('An account with this mobile number already exists.');
    }

    return this.tx(() => {
      const { hash, salt } = hashPin(pin);
      const owner = this.repos.users.insert({
        name,
        phone,
        pinHash: hash,
        pinSalt: salt,
        role: 'organizer',
        city,
      });
      this.repos.audit.insert({
        actorId: this.actorId(actor),
        action: 'owner.invite',
        entity: 'user',
        entityId: owner.id,
        before: null,
        after: { name, phone, city, role: 'organizer' },
      });
      return this.requireOwnerSummary(owner.id);
    });
  }

  updateOwner(
    actor: AuthUser,
    ownerId: number,
    input: { name?: unknown; city?: unknown; isActive?: unknown }
  ): OwnerSummary {
    const owner = this.requireOwnerRecord(ownerId);
    const before = { name: owner.name, city: owner.city, isActive: owner.isActive };

    const name = input.name === undefined ? undefined : requireText(input.name, 'Name');
    const city = input.city === undefined ? undefined : requireText(input.city, 'City');
    let isActive: boolean | undefined;
    if (input.isActive !== undefined) {
      if (typeof input.isActive !== 'boolean') throw badRequest('isActive must be true or false.');
      isActive = input.isActive;
    }
    if (name === undefined && city === undefined && isActive === undefined) {
      throw badRequest('Nothing to update. Provide name, city or isActive.');
    }

    return this.tx(() => {
      this.repos.users.updateProfile(owner.id, { name, city });
      if (isActive !== undefined) this.repos.users.setActive(owner.id, isActive);
      this.repos.audit.insert({
        actorId: this.actorId(actor),
        action: 'owner.update',
        entity: 'user',
        entityId: owner.id,
        before,
        after: {
          name: name ?? owner.name,
          city: city ?? owner.city,
          isActive: isActive ?? owner.isActive,
        },
      });
      return this.requireOwnerSummary(owner.id);
    });
  }

  resetOwnerPin(actor: AuthUser, ownerId: number, pin: unknown): void {
    const owner = this.requireOwnerRecord(ownerId);
    const newPin = requirePin(pin, 'New PIN');
    const { hash, salt } = hashPin(newPin);
    this.tx(() => {
      this.repos.users.updatePin(owner.id, hash, salt);
      this.repos.audit.insert({
        actorId: this.actorId(actor),
        action: 'owner.reset-pin',
        entity: 'user',
        entityId: owner.id,
        before: null,
        // The PIN itself is never stored in the audit trail.
        after: { pin: '***' },
      });
    });
  }

  deleteOwner(actor: AuthUser, ownerId: number): void {
    const owner = this.requireOwnerRecord(ownerId);
    const chitCount = this.repos.chits.countByOrganizer(owner.id);
    if (chitCount > 0) {
      throw conflict(
        `Cannot delete ${owner.name}: this owner still has ${chitCount} chit group(s). ` +
          'Remove or complete their chits first.'
      );
    }
    this.tx(() => {
      this.repos.audit.insert({
        actorId: this.actorId(actor),
        action: 'owner.delete',
        entity: 'user',
        entityId: owner.id,
        before: { name: owner.name, phone: owner.phone, city: owner.city, role: owner.role },
        after: null,
      });
      this.repos.users.deleteById(owner.id);
    });
  }

  platformStats(): PlatformStats {
    return {
      owners: this.repos.users.countByRole('organizer'),
      chits: this.repos.chits.countAll(),
      members: this.repos.users.countByRole('member'),
    };
  }

  private requireOwnerRecord(ownerId: number): UserRecord {
    const owner = this.repos.users.findById(ownerId);
    if (!owner || owner.role !== 'organizer') throw notFound('Owner not found.');
    return owner;
  }

  private requireOwnerSummary(ownerId: number): OwnerSummary {
    const summary = this.repos.users.listOwners().find((o) => o.id === ownerId);
    if (!summary) throw notFound('Owner not found.');
    return summary;
  }
}
