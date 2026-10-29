import { randomUUID } from "node:crypto";
import {
  aiScopeSchema,
  type AiCapability,
  type AiScope,
} from "../../shared/ai-types";

type Duration = "once" | "session";
interface Grant {
  capability: AiCapability;
  scope: AiScope;
  duration: Duration;
}
interface Pending {
  scope: AiScope;
  capability: AiCapability;
  expires: number;
  payload?: Uint8Array;
  preview?: string;
}
const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024;
const MAX_PREVIEW_CHARS = 8_192;
const MAX_PENDING = 4;
const TICKET_MS = 60_000;

const sameScope = (a: AiScope, b: AiScope) =>
  a.profileId === b.profileId &&
  a.tabId === b.tabId &&
  a.origin === b.origin &&
  a.documentId === b.documentId;

/** Memory-only AI consent. A grant never survives browser restart or page navigation. */
export class AiConsentGate {
  private grants: Grant[] = [];
  private pending = new Map<string, Pending>();

  grant(scope: AiScope, capability: AiCapability, duration: Duration): void {
    aiScopeSchema.parse(scope);
    if (duration !== "once" && duration !== "session")
      throw new Error("AI_CONSENT_DURATION_INVALID");
    this.grants = this.grants.filter(
      (grant) =>
        grant.capability !== capability || !sameScope(grant.scope, scope),
    );
    this.grants.push({ scope: { ...scope }, capability, duration });
  }

  has(scope: AiScope, capability: AiCapability): boolean {
    aiScopeSchema.parse(scope);
    return this.grants.some(
      (grant) =>
        grant.capability === capability && sameScope(grant.scope, scope),
    );
  }

  /** Consume a collection grant before touching DOM, pixels, logs, or network data. */
  begin(
    scope: AiScope,
    capability: Exclude<AiCapability, "cloudUpload">,
  ): string {
    aiScopeSchema.parse(scope);
    this.prune();
    if (this.pending.size >= MAX_PENDING) throw new Error("AI_PREVIEW_LIMIT");
    const index = this.grants.findIndex(
      (grant) =>
        grant.capability === capability && sameScope(grant.scope, scope),
    );
    if (index < 0) throw new Error("AI_CONSENT_REQUIRED");
    if (this.grants[index].duration === "once") this.grants.splice(index, 1);
    const ticket = randomUUID();
    this.pending.set(ticket, {
      scope: { ...scope },
      capability,
      expires: Date.now() + TICKET_MS,
    });
    return ticket;
  }

  /** Preview text is explicit and bounded; payload is never exposed by status. */
  stage(
    ticket: string,
    scope: AiScope,
    payload: Uint8Array,
    preview: string,
  ): void {
    aiScopeSchema.parse(scope);
    this.prune();
    const pending = this.pending.get(ticket);
    if (!pending || !sameScope(pending.scope, scope))
      throw new Error("AI_PREVIEW_EXPIRED");
    if (pending.payload) throw new Error("AI_PREVIEW_ALREADY_STAGED");
    if (
      !(payload instanceof Uint8Array) ||
      payload.length === 0 ||
      payload.length > MAX_PAYLOAD_BYTES ||
      typeof preview !== "string" ||
      preview.length > MAX_PREVIEW_CHARS
    )
      throw new Error("AI_PREVIEW_INVALID");
    pending.payload = new Uint8Array(payload);
    pending.preview = preview;
  }

  preview(ticket: string, scope: AiScope): string | undefined {
    aiScopeSchema.parse(scope);
    this.prune();
    const pending = this.pending.get(ticket);
    return pending && sameScope(pending.scope, scope)
      ? pending.preview
      : undefined;
  }

  /** Separate user confirmation; cloud transport requires its own grant. */
  confirm(ticket: string, scope: AiScope, cloud: boolean): Uint8Array {
    aiScopeSchema.parse(scope);
    this.prune();
    const pending = this.pending.get(ticket);
    if (!pending || !sameScope(pending.scope, scope) || !pending.payload)
      throw new Error("AI_PREVIEW_EXPIRED");
    if (cloud) {
      const index = this.grants.findIndex(
        (grant) =>
          grant.capability === "cloudUpload" && sameScope(grant.scope, scope),
      );
      if (index < 0) throw new Error("AI_CLOUD_CONSENT_REQUIRED");
      if (this.grants[index].duration === "once") this.grants.splice(index, 1);
    }
    this.pending.delete(ticket);
    return new Uint8Array(pending.payload);
  }

  revoke(scope: AiScope, capability?: AiCapability): void {
    aiScopeSchema.parse(scope);
    this.grants = this.grants.filter(
      (grant) =>
        !sameScope(grant.scope, scope) ||
        (capability !== undefined && grant.capability !== capability),
    );
    for (const [ticket, pending] of this.pending)
      if (
        sameScope(pending.scope, scope) &&
        (capability === undefined ||
          pending.capability === capability ||
          capability === "cloudUpload")
      )
        this.pending.delete(ticket);
  }

  endDocument(tabId: string): void {
    this.grants = this.grants.filter((grant) => grant.scope.tabId !== tabId);
    for (const [ticket, pending] of this.pending)
      if (pending.scope.tabId === tabId) this.pending.delete(ticket);
  }

  endProfile(profileId: string): void {
    this.grants = this.grants.filter(
      (grant) => grant.scope.profileId !== profileId,
    );
    for (const [ticket, pending] of this.pending)
      if (pending.scope.profileId === profileId) this.pending.delete(ticket);
  }

  stop(): void {
    this.grants = [];
    this.pending.clear();
  }

  snapshot(): { grants: number; pending: number } {
    this.prune();
    return { grants: this.grants.length, pending: this.pending.size };
  }
  details(
    ticket: string,
  ):
    | { scope: AiScope; capability: AiCapability; expiresAt: number }
    | undefined {
    this.prune();
    const pending = this.pending.get(ticket);
    return pending
      ? {
          scope: { ...pending.scope },
          capability: pending.capability,
          expiresAt: pending.expires,
        }
      : undefined;
  }
  discard(ticket: string): void {
    this.pending.delete(ticket);
  }

  private prune(): void {
    const now = Date.now();
    for (const [ticket, pending] of this.pending)
      if (pending.expires <= now) this.pending.delete(ticket);
  }
}
