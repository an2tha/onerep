import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";

const modules = import.meta.glob("../**/*.ts");

const OWNER = { name: "Owner", email: "owner@example.com" };
const VIEWER = { name: "Viewer", email: "viewer@example.com" };
const STRANGER = { name: "Stranger", email: "stranger@example.com" };

const FULL_SCOPE = { diary: true, report: true, comments: true };

type Test = ReturnType<typeof convexTest>;

/** Owner invites the viewer and returns the invite token plus the owner id. */
async function invite(
  t: Test,
  scope = FULL_SCOPE,
  bounds: { startDate?: string; endDate?: string } = {},
) {
  let token = "";
  let ownerUserId = "";
  await t.withIdentity(OWNER, async () => {
    await t.mutation(api.sharing.diaryShares.invite, {
      email: VIEWER.email,
      scope,
      ...bounds,
    });
    const outgoing = await t.query(api.sharing.diaryShares.listOutgoing, {});
    token = outgoing[0].token;
    ownerUserId = outgoing[0].ownerUserId;
  });
  return { token, ownerUserId };
}

async function acceptAs(t: Test, token: string) {
  await t.withIdentity(VIEWER, async () => {
    await t.mutation(api.sharing.diaryShares.acceptInvite, { token });
  });
}

async function logFood(t: Test, date: string, name = "Oats") {
  await t.withIdentity(OWNER, async () => {
    await t.mutation(api.logs.foodLogs.addEntry, {
      date,
      entry: {
        id: `${date}-1`,
        name,
        calories: 300,
        protein: 10,
        carbs: 50,
        fat: 5,
        meal: "breakfast",
        loggedAt: `${date}T08:00:00.000Z`,
      },
    });
  });
}

describe("diary access gate", () => {
  test("a stranger cannot read the diary", async () => {
    const t = convexTest(schema, modules);
    const { ownerUserId } = await invite(t);
    await logFood(t, "2026-07-31");

    await t.withIdentity(STRANGER, async () => {
      await expect(
        t.query(api.sharing.sharedDiary.getSharedDay, {
          ownerUserId,
          date: "2026-07-31",
        }),
      ).rejects.toThrow(/No access to this diary/i);
    });
  });

  test("a pending invite grants nothing until it is accepted", async () => {
    const t = convexTest(schema, modules);
    const { ownerUserId } = await invite(t);
    await logFood(t, "2026-07-31");

    await t.withIdentity(VIEWER, async () => {
      await expect(
        t.query(api.sharing.sharedDiary.getSharedDay, {
          ownerUserId,
          date: "2026-07-31",
        }),
      ).rejects.toThrow(/No access to this diary/i);
    });
  });

  test("an accepted invite grants read access", async () => {
    const t = convexTest(schema, modules);
    const { token, ownerUserId } = await invite(t);
    await logFood(t, "2026-07-31", "Porridge");
    await acceptAs(t, token);

    await t.withIdentity(VIEWER, async () => {
      const day = await t.query(api.sharing.sharedDiary.getSharedDay, {
        ownerUserId,
        date: "2026-07-31",
      });
      expect(day?.entries).toHaveLength(1);
      expect(day?.entries[0].name).toBe("Porridge");
    });
  });

  test("revoking access takes effect immediately", async () => {
    const t = convexTest(schema, modules);
    const { token, ownerUserId } = await invite(t);
    await logFood(t, "2026-07-31");
    await acceptAs(t, token);

    await t.withIdentity(OWNER, async () => {
      const outgoing = await t.query(api.sharing.diaryShares.listOutgoing, {});
      await t.mutation(api.sharing.diaryShares.revoke, { id: outgoing[0]._id });
    });

    await t.withIdentity(VIEWER, async () => {
      await expect(
        t.query(api.sharing.sharedDiary.getSharedDay, {
          ownerUserId,
          date: "2026-07-31",
        }),
      ).rejects.toThrow(/No access to this diary/i);
    });
  });

  test("the owner always reads their own diary without a grant", async () => {
    const t = convexTest(schema, modules);
    await logFood(t, "2026-07-31");
    await t.withIdentity(OWNER, async () => {
      const day = await t.query(api.sharing.sharedDiary.getSharedDay, {
        ownerUserId: "",
        date: "2026-07-31",
      });
      expect(day?.entries).toHaveLength(1);
    });
  });
});

describe("date scoping", () => {
  test("a day before the grant's start date is refused", async () => {
    const t = convexTest(schema, modules);
    const { token, ownerUserId } = await invite(t, FULL_SCOPE, {
      startDate: "2026-01-01",
    });
    await logFood(t, "2025-12-31");
    await acceptAs(t, token);

    await t.withIdentity(VIEWER, async () => {
      await expect(
        t.query(api.sharing.sharedDiary.getSharedDay, {
          ownerUserId,
          date: "2025-12-31",
        }),
      ).rejects.toThrow(/No access to this diary/i);
    });
  });

  test("a day after the grant's end date is refused", async () => {
    const t = convexTest(schema, modules);
    const { token, ownerUserId } = await invite(t, FULL_SCOPE, {
      endDate: "2026-06-30",
    });
    await logFood(t, "2026-07-31");
    await acceptAs(t, token);

    await t.withIdentity(VIEWER, async () => {
      await expect(
        t.query(api.sharing.sharedDiary.getSharedDay, {
          ownerUserId,
          date: "2026-07-31",
        }),
      ).rejects.toThrow(/No access to this diary/i);
    });
  });

  test("a range request is clamped rather than leaking outside the window", async () => {
    const t = convexTest(schema, modules);
    const { token, ownerUserId } = await invite(t, FULL_SCOPE, {
      startDate: "2026-07-15",
    });
    await logFood(t, "2026-07-01", "Before the window");
    await logFood(t, "2026-07-20", "Inside the window");
    await acceptAs(t, token);

    await t.withIdentity(VIEWER, async () => {
      const range = await t.query(api.sharing.sharedDiary.getSharedRange, {
        ownerUserId,
        start: "2026-01-01",
        end: "2026-12-31",
      });
      expect(range.map((day) => day.date)).toEqual(["2026-07-20"]);
    });
  });

  test("a range with no overlap yields nothing rather than everything", async () => {
    const t = convexTest(schema, modules);
    const { token, ownerUserId } = await invite(t, FULL_SCOPE, {
      startDate: "2026-07-15",
      endDate: "2026-07-20",
    });
    await logFood(t, "2026-07-18");
    await acceptAs(t, token);

    await t.withIdentity(VIEWER, async () => {
      const range = await t.query(api.sharing.sharedDiary.getSharedRange, {
        ownerUserId,
        start: "2026-01-01",
        end: "2026-01-31",
      });
      expect(range).toEqual([]);
    });
  });
});

describe("scope flags", () => {
  test("a grant with nothing enabled refuses the report range", async () => {
    const t = convexTest(schema, modules);
    const { token, ownerUserId } = await invite(t, {
      diary: false,
      report: false,
      comments: false,
    });
    await acceptAs(t, token);

    await t.withIdentity(VIEWER, async () => {
      await expect(
        t.query(api.sharing.sharedDiary.getSharedRange, {
          ownerUserId,
          start: "2026-07-01",
          end: "2026-07-31",
        }),
      ).rejects.toThrow(/No access to this diary/i);
    });
  });

  test("commenting fails when the grant does not allow it", async () => {
    const t = convexTest(schema, modules);
    const { token, ownerUserId } = await invite(t, {
      diary: true,
      report: true,
      comments: false,
    });
    await acceptAs(t, token);

    await t.withIdentity(VIEWER, async () => {
      await expect(
        t.mutation(api.sharing.diaryComments.add, {
          ownerUserId,
          date: "2026-07-31",
          body: "Nice work",
        }),
      ).rejects.toThrow(/No access to this diary/i);
    });
  });

  test("commenting outside the granted dates is refused", async () => {
    const t = convexTest(schema, modules);
    const { token, ownerUserId } = await invite(t, FULL_SCOPE, {
      startDate: "2026-07-01",
    });
    await acceptAs(t, token);

    await t.withIdentity(VIEWER, async () => {
      await expect(
        t.mutation(api.sharing.diaryComments.add, {
          ownerUserId,
          date: "2026-06-30",
          body: "Out of range",
        }),
      ).rejects.toThrow(/No access to this diary/i);
    });
  });

  test("the shared goals view does not leak the health profile", async () => {
    const t = convexTest(schema, modules);
    const { token, ownerUserId } = await invite(t);
    await acceptAs(t, token);

    await t.withIdentity(VIEWER, async () => {
      const goals = await t.query(api.sharing.sharedDiary.getSharedGoals, {
        ownerUserId,
      });
      // Only targets — never weight, height or age.
      expect(Object.keys(goals).sort()).toEqual([
        "calories",
        "carbs",
        "fat",
        "netCarbsEnabled",
        "protein",
      ]);
    });
  });
});

describe("invite claiming", () => {
  test("a token whose email differs from the caller's is rejected", async () => {
    const t = convexTest(schema, modules);
    const { token } = await invite(t);

    await t.withIdentity(STRANGER, async () => {
      await expect(
        t.mutation(api.sharing.diaryShares.acceptInvite, { token }),
      ).rejects.toThrow(/different email address/i);
    });
  });

  test("a stranger holding the token cannot even read the invite", async () => {
    const t = convexTest(schema, modules);
    const { token } = await invite(t);

    await t.withIdentity(STRANGER, async () => {
      expect(
        await t.query(api.sharing.diaryShares.getInviteByToken, { token }),
      ).toBeNull();
    });
  });

  test("an invite cannot be accepted twice", async () => {
    const t = convexTest(schema, modules);
    const { token } = await invite(t);
    await acceptAs(t, token);

    await t.withIdentity(VIEWER, async () => {
      await expect(
        t.mutation(api.sharing.diaryShares.acceptInvite, { token }),
      ).rejects.toThrow(/no longer available/i);
    });
  });

  test("a declined invite grants nothing", async () => {
    const t = convexTest(schema, modules);
    const { token, ownerUserId } = await invite(t);
    await t.withIdentity(VIEWER, async () => {
      await t.mutation(api.sharing.diaryShares.declineInvite, { token });
      await expect(
        t.query(api.sharing.sharedDiary.getSharedDay, {
          ownerUserId,
          date: "2026-07-31",
        }),
      ).rejects.toThrow(/No access to this diary/i);
    });
  });

  test("the invite email is normalised so casing does not block a claim", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity(OWNER, async () => {
      await t.mutation(api.sharing.diaryShares.invite, {
        email: "  VIEWER@Example.COM ",
        scope: FULL_SCOPE,
      });
    });

    await t.withIdentity(VIEWER, async () => {
      const incoming = await t.query(api.sharing.diaryShares.listIncoming, {});
      expect(incoming).toHaveLength(1);
      await t.mutation(api.sharing.diaryShares.acceptInvite, {
        token: incoming[0].token,
      });
    });
  });

  test("inviting yourself is rejected", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity(OWNER, async () => {
      await expect(
        t.mutation(api.sharing.diaryShares.invite, {
          email: OWNER.email,
          scope: FULL_SCOPE,
        }),
      ).rejects.toThrow(/your own diary/i);
    });
  });

  test("a duplicate live invite to the same person is rejected", async () => {
    const t = convexTest(schema, modules);
    await invite(t);
    await t.withIdentity(OWNER, async () => {
      await expect(
        t.mutation(api.sharing.diaryShares.invite, {
          email: VIEWER.email,
          scope: FULL_SCOPE,
        }),
      ).rejects.toThrow(/already shared/i);
    });
  });

  test("a reversed date window is rejected at invite time", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity(OWNER, async () => {
      await expect(
        t.mutation(api.sharing.diaryShares.invite, {
          email: VIEWER.email,
          scope: FULL_SCOPE,
          startDate: "2026-07-31",
          endDate: "2026-01-01",
        }),
      ).rejects.toThrow(/end date must not be before/i);
    });
  });
});

describe("comment moderation", () => {
  async function seedComment(t: Test) {
    const { token, ownerUserId } = await invite(t);
    await acceptAs(t, token);
    let commentId!: string;
    await t.withIdentity(VIEWER, async () => {
      commentId = await t.mutation(api.sharing.diaryComments.add, {
        ownerUserId,
        date: "2026-07-31",
        body: "Great protein day",
      });
    });
    return { commentId, ownerUserId };
  }

  test("a third party cannot edit or delete a comment", async () => {
    const t = convexTest(schema, modules);
    const { commentId } = await seedComment(t);

    await t.withIdentity(STRANGER, async () => {
      await expect(
        t.mutation(api.sharing.diaryComments.edit, {
          id: commentId as never,
          body: "Tampered",
        }),
      ).rejects.toThrow(/not found or access denied/i);
      await expect(
        t.mutation(api.sharing.diaryComments.remove, {
          id: commentId as never,
        }),
      ).rejects.toThrow(/not found or access denied/i);
    });
  });

  test("the diary owner can remove a comment but not edit it", async () => {
    const t = convexTest(schema, modules);
    const { commentId } = await seedComment(t);

    await t.withIdentity(OWNER, async () => {
      // Moderation, not impersonation: removing is allowed, rewriting is not.
      await expect(
        t.mutation(api.sharing.diaryComments.edit, {
          id: commentId as never,
          body: "Put words in their mouth",
        }),
      ).rejects.toThrow(/not found or access denied/i);

      await t.mutation(api.sharing.diaryComments.remove, {
        id: commentId as never,
      });
      const remaining = await t.query(api.sharing.diaryComments.listForDay, {
        date: "2026-07-31",
      });
      expect(remaining).toHaveLength(0);
    });
  });

  test("the author can edit their own comment", async () => {
    const t = convexTest(schema, modules);
    const { commentId, ownerUserId } = await seedComment(t);

    await t.withIdentity(VIEWER, async () => {
      await t.mutation(api.sharing.diaryComments.edit, {
        id: commentId as never,
        body: "Edited note",
      });
      const comments = await t.query(api.sharing.diaryComments.listForDay, {
        ownerUserId,
        date: "2026-07-31",
      });
      expect(comments[0].body).toBe("Edited note");
      expect(comments[0].editedAt).toBeDefined();
    });
  });

  test("an empty comment is rejected", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity(OWNER, async () => {
      await expect(
        t.mutation(api.sharing.diaryComments.add, {
          date: "2026-07-31",
          body: "   ",
        }),
      ).rejects.toThrow(/cannot be empty/i);
    });
  });

  test("unread counts exclude your own comments", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity(OWNER, async () => {
      await t.mutation(api.sharing.diaryComments.add, {
        date: "2026-07-31",
        body: "My own note",
      });
      expect(await t.query(api.sharing.diaryComments.unreadCount, {})).toBe(0);
    });

    // A viewer's comment on the same diary does count.
    await seedComment(t);

    await t.withIdentity(OWNER, async () => {
      expect(await t.query(api.sharing.diaryComments.unreadCount, {})).toBe(1);
      await t.mutation(api.sharing.diaryComments.markRead, {});
      expect(await t.query(api.sharing.diaryComments.unreadCount, {})).toBe(0);
    });
  });
});
