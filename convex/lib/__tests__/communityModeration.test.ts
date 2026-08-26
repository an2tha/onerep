import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  AUTO_REMOVE_REPORT_THRESHOLD,
  findBlockedTerm,
} from "../communityModeration";

/**
 * The filter's job is to keep slurs out of a public recipe feed without
 * refusing to publish a bean stew. Both halves get tested, and the
 * false-positive half is the one that matters: a filter that blocks real
 * cooking is a filter people learn to work around, and Scunthorpe has been
 * embarrassing software since 1996.
 */
describe("community text filter", () => {
  test("publishes ordinary recipes", () => {
    for (const title of [
      "Cucumber and dill salad",
      "Pasta e fagioli",
      "Rapeseed oil roast potatoes",
      "Grandma's cream pie",
      "Grape and rocket salad",
      "Scunthorpe hotpot",
      "Assam tea loaf",
      "Cockles in white wine",
      "Shiitake and coconut broth",
      "Damn good chilli",
      "Penne all'arrabbiata",
      "Cocoa and hazelnut bites",
    ]) {
      assert.equal(findBlockedTerm([title]), null, title);
    }
  });

  test("refuses slurs and explicit content", () => {
    for (const title of [
      "faggot casserole",
      "PORN cake",
      "bestiality",
      "a recipe for incest",
    ]) {
      assert.notEqual(findBlockedTerm([title]), null, title);
    }
  });

  test("sees through padding and leetspeak", () => {
    // The two evasions anyone tries first. Neither should get through.
    assert.notEqual(findBlockedTerm(["p0rn cake"]), null);
    assert.notEqual(findBlockedTerm(["n i g g e r stew"]), null);
  });

  test("reads every field it is given, not just the title", () => {
    assert.equal(findBlockedTerm(["Chilli", "Slow and rich"]), null);
    assert.notEqual(
      findBlockedTerm(["Chilli", "a description containing faggot"]),
      null,
    );
  });

  test("survives nothing to check", () => {
    assert.equal(findBlockedTerm([]), null);
    assert.equal(findBlockedTerm([null, undefined, "", "   "]), null);
  });
});

describe("automatic takedown threshold", () => {
  test("takes more than one person to remove somebody else's recipe", () => {
    // One report being enough would make every author's work deletable by any
    // single reader; five would mean nothing is ever removed on a feed this
    // size. The number is allowed to change — the two properties are not.
    assert.ok(AUTO_REMOVE_REPORT_THRESHOLD > 1);
    assert.ok(AUTO_REMOVE_REPORT_THRESHOLD <= 3);
  });
});
