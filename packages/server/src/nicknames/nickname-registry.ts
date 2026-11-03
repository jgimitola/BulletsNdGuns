import { isReservedNickname, nicknameKey, parseNickname, type NicknameError } from '@bng/shared';
import type { AccountDirectory } from '../auth/account-directory.ts';

export type ClaimResult = { ok: true; nickname: string } | { ok: false; error: NicknameError };

/** A guest who lost their nickname to an account, and the name they lost. */
export interface Revoked {
  socketId: string;
  nickname: string;
}

type Holder = { nickname: string; accountId: string | null };

/**
 * Who holds which nickname right now, by socket. Guests claim one; account sockets take theirs from
 * the session. Two holders never share a key, except one account's own sockets (two tabs). An
 * account that registers or renames to a guest's name takes it from the guest.
 */
export class NicknameRegistry {
  private readonly accounts: AccountDirectory;
  private readonly holders = new Map<string, Holder>();
  private readonly socketsByKey = new Map<string, Set<string>>();

  constructor(accounts: AccountDirectory) {
    this.accounts = accounts;
  }

  /** Replaces this socket's previous guest claim on success; a refused claim changes nothing. */
  async claimGuest(socketId: string, raw: unknown): Promise<ClaimResult> {
    const nickname = parseNickname(raw);
    if (nickname === null) return { ok: false, error: 'invalid' };
    if (isReservedNickname(nickname) || this.heldByOther(socketId, nickname)) {
      return { ok: false, error: 'taken' };
    }
    const registered = await this.accounts.isNicknameRegistered(nickname);
    // Someone may have claimed it while the directory answered.
    if (registered || this.heldByOther(socketId, nickname)) return { ok: false, error: 'taken' };
    this.set(socketId, { nickname, accountId: null });
    return { ok: true, nickname };
  }

  connectAccount(socketId: string, accountId: string, nickname: string): void {
    this.set(socketId, { nickname, accountId });
  }

  /** The account's sockets take `nickname`; guests holding it lose it and are returned. */
  accountNicknameChanged(accountId: string, nickname: string): Revoked[] {
    const revoked: Revoked[] = [];
    for (const socketId of this.socketsByKey.get(nicknameKey(nickname)) ?? []) {
      const holder = this.holders.get(socketId);
      if (holder && holder.accountId === null) {
        revoked.push({ socketId, nickname: holder.nickname });
        this.release(socketId);
      }
    }
    for (const [socketId, holder] of [...this.holders]) {
      if (holder.accountId === accountId) this.set(socketId, { nickname, accountId });
    }
    return revoked;
  }

  release(socketId: string): void {
    const holder = this.holders.get(socketId);
    if (!holder) return;
    this.holders.delete(socketId);
    const key = nicknameKey(holder.nickname);
    const sockets = this.socketsByKey.get(key);
    sockets?.delete(socketId);
    if (sockets?.size === 0) this.socketsByKey.delete(key);
  }

  nicknameOf(socketId: string): string | null {
    return this.holders.get(socketId)?.nickname ?? null;
  }

  accountOf(socketId: string): string | null {
    return this.holders.get(socketId)?.accountId ?? null;
  }

  private heldByOther(socketId: string, nickname: string): boolean {
    const sockets = this.socketsByKey.get(nicknameKey(nickname));
    return sockets !== undefined && [...sockets].some((id) => id !== socketId);
  }

  private set(socketId: string, holder: Holder): void {
    this.release(socketId);
    this.holders.set(socketId, holder);
    const key = nicknameKey(holder.nickname);
    let sockets = this.socketsByKey.get(key);
    if (!sockets) this.socketsByKey.set(key, (sockets = new Set()));
    sockets.add(socketId);
  }
}
