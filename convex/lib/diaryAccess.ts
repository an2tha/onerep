import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getAuthUser, safeGetAuthUser } from "./auth";

/**
 * The single gate for reading someone else's diary.
 *
 * Every existing food query hard-filters `userId === user._id`. Rather than
 * loosening those, the shared read path goes through here and then queries with
 * the resolved owner id. That keeps the owner's own queries untouched and
 * confines the whole authorization surface to this file plus `convex/sharing/`.
 */

export type DiaryAccess = {
  ownerUserId: string;
  isOwner: boolean;
  share: Doc<"diaryShares"> | null;
  canComment: boolean;
  canReadDiary: boolean;
  canReadReport: boolean;
  startDate?: string;
  endDate?: string;
};

export const NO_ACCESS_MESSAGE = "No access to this diary";

export function canReadComments(access: DiaryAccess) {
  return access.isOwner || access.canReadDiary || access.canComment;
}

function ownAccess(userId: string): DiaryAccess {
  return {
    ownerUserId: userId,
    isOwner: true,
    share: null,
    canComment: true,
    canReadDiary: true,
    canReadReport: true,
  };
}

/**
 * Resolves whose diary the caller is allowed to read.
 *
 * No `ownerUserId` (or one equal to the caller) means their own diary. Anything
 * else requires an **accepted** grant whose `inviteeUserId` is the caller —
 * pending, declined and revoked grants all confer nothing.
 */
export async function resolveDiaryOwner(
  ctx: QueryCtx | MutationCtx,
  args: { ownerUserId?: string },
): Promise<DiaryAccess> {
  const user = await getAuthUser(ctx);

  if (!args.ownerUserId || args.ownerUserId === user._id) {
    return ownAccess(user._id);
  }

  const share = await ctx.db
    .query("diaryShares")
    .withIndex("by_inviteeUserId_and_status", (q) =>
      q.eq("inviteeUserId", user._id).eq("status", "accepted"),
    )
    .filter((q) => q.eq(q.field("ownerUserId"), args.ownerUserId!))
    .first();

  if (!share) throw new Error(NO_ACCESS_MESSAGE);

  return {
    ownerUserId: share.ownerUserId,
    isOwner: false,
    share,
    canComment: !!share.scope.comments,
    canReadDiary: !!share.scope.diary,
    canReadReport: !!share.scope.report,
    startDate: share.startDate,
    endDate: share.endDate,
  };
}

/** Query-side variant: returns null instead of throwing, for a graceful UI. */
export async function safeResolveDiaryOwner(
  ctx: QueryCtx | MutationCtx,
  args: { ownerUserId?: string },
): Promise<DiaryAccess | null> {
  const user = await safeGetAuthUser(ctx);
  if (!user) return null;
  try {
    return await resolveDiaryOwner(ctx, args);
  } catch {
    return null;
  }
}

/** Throws unless the grant's date window covers `date`. Owners are unbounded. */
export function assertDateInScope(access: DiaryAccess, date: string): void {
  if (access.isOwner) return;
  if (access.startDate && date < access.startDate) {
    throw new Error(NO_ACCESS_MESSAGE);
  }
  if (access.endDate && date > access.endDate) {
    throw new Error(NO_ACCESS_MESSAGE);
  }
}

/**
 * Narrows a requested range to the grant's window.
 *
 * Clamping rather than throwing means a viewer asking for "last 90 days" on a
 * 30-day grant sees 30 days instead of an error — but they can never see a day
 * outside the window. A range with no overlap yields an empty window.
 */
export function clampRangeToScope(
  access: DiaryAccess,
  start: string,
  end: string,
): { start: string; end: string; empty: boolean } {
  if (access.isOwner) return { start, end, empty: start > end };

  const clampedStart =
    access.startDate && access.startDate > start ? access.startDate : start;
  const clampedEnd =
    access.endDate && access.endDate < end ? access.endDate : end;

  return {
    start: clampedStart,
    end: clampedEnd,
    empty: clampedStart > clampedEnd,
  };
}
