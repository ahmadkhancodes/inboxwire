import { beforeEach, describe, expect, it, vi } from "vitest";

const notify = vi.fn(async () => 1);
vi.mock("@/lib/billing/limit-notice", () => ({ notifyMailboxLimit: notify }));

const { ensureCapacity } = await import("@/lib/connect/complete");
const { createMemoryDb } = await import("@/lib/db/memory");

// Day 7 of the persona walk-through: an end user is refused at the plan cap. The developer must hear about it.
describe("a connect refused at the mailbox limit tells the owners", () => {
  beforeEach(() => notify.mockClear());

  it("402 mailbox_limit for the end user, and one notice call with the plan and limit", async () => {
    const db = createMemoryDb("inboxwire");
    const env = await db.ensureEnvironment("org_cap", "production");
    for (let i = 0; i < 3; i++) await db.upsertAccount({ id: `a${i}`, envId: env.id, externalId: `u${i}`, email: `u${i}@x.test`, provider: "imap", backend: "imap", state: "connected", lastError: null, nextPollAt: null, mode: "polling" });
    await expect(ensureCapacity(db, env.id, "new@x.test")).rejects.toMatchObject({ status: 402, code: "mailbox_limit" });
    expect(notify).toHaveBeenCalledWith(db, "org_cap", "free", 3);
    // Reconnecting an address that is already a line is always allowed and sends nothing.
    await expect(ensureCapacity(db, env.id, "u1@x.test")).resolves.toBeUndefined();
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("no notice while there is room", async () => {
    const db = createMemoryDb("inboxwire");
    const env = await db.ensureEnvironment("org_room", "production");
    await expect(ensureCapacity(db, env.id, "first@x.test")).resolves.toBeUndefined();
    expect(notify).not.toHaveBeenCalled();
  });
});
