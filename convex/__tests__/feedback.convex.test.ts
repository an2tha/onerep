import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import { api } from "../_generated/api";
import schema from "../schema";

const modules = import.meta.glob("../**/*.ts");

describe("moderated feedback", () => {
  test("new submissions stay pending and private to their author", async () => {
    const t = convexTest(schema, modules);
    const author = t.withIdentity({
      tokenIdentifier: "test|feedback-author",
      name: "Ada Lifter",
    });

    await author.mutation(api.feedback.submit, {
      kind: "feature",
      title: "Compare training weeks",
      details:
        "Let me compare volume and exercise changes across any two weeks.",
      platform: "web",
    });

    const mine = await author.query(api.feedback.mine, {});
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      kind: "feature",
      status: "pending",
      authorName: "Ada Lifter",
      voteCount: 0,
    });
    await expect(author.query(api.feedback.listFeatures, {})).resolves.toEqual(
      [],
    );
  });

  test("only approved features can be voted on, once per member", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const featureId = await t.run((ctx) =>
      ctx.db.insert("feedbackItems", {
        userId: "test|author",
        authorName: "Sam",
        kind: "feature",
        title: "Share a training block",
        details:
          "Let me send a read-only training block to another OneRep member.",
        status: "approved",
        voteCount: 0,
        createdAt: now,
        updatedAt: now,
      }),
    );
    const voter = t.withIdentity({ tokenIdentifier: "test|voter", name: "Jo" });

    await expect(
      voter.mutation(api.feedback.toggleVote, { itemId: featureId }),
    ).resolves.toEqual({
      voted: true,
    });
    let board = await voter.query(api.feedback.listFeatures, {});
    expect(board[0]).toMatchObject({ voteCount: 1, hasVoted: true });

    await expect(
      voter.mutation(api.feedback.toggleVote, { itemId: featureId }),
    ).resolves.toEqual({
      voted: false,
    });
    board = await voter.query(api.feedback.listFeatures, {});
    expect(board[0]).toMatchObject({ voteCount: 0, hasVoted: false });
  });

  test("rejects underspecified feedback", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({
      tokenIdentifier: "test|brief",
      name: "Brief",
    });
    await expect(
      user.mutation(api.feedback.submit, {
        kind: "bug",
        title: "Bug",
        details: "It broke.",
      }),
    ).rejects.toThrow();
  });
});
