import { describe, test, expect } from "bun:test";
import {
  emptyRoutine,
  movePresetById,
  normalizePresetCard,
  normalizeRoutine,
  normalizeScheduleRoutines,
  scheduleRoutinePayload,
  todayIso,
} from "../workout-sync";

describe("todayIso", () => {
  test("returns a string in YYYY-MM-DD format", () => {
    const result = todayIso();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("matches today's date", () => {
    const result = todayIso();
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    expect(result).toBe(expected);
  });

  test("month and day are zero-padded", () => {
    const result = todayIso();
    const [, month, day] = result.split("-");
    expect(month.length).toBe(2);
    expect(day.length).toBe(2);
  });
});

describe("normalizePresetCard", () => {
  const base = {
    id: "preset-1",
    name: "Push Day",
  };

  describe("focus normalization", () => {
    test("passes through 'strength' focus", () => {
      expect(normalizePresetCard({ ...base, focus: "strength" }).focus).toBe("strength");
    });

    test("passes through 'cardio' focus", () => {
      expect(normalizePresetCard({ ...base, focus: "cardio" }).focus).toBe("cardio");
    });

    test("passes through 'mobility' focus", () => {
      expect(normalizePresetCard({ ...base, focus: "mobility" }).focus).toBe("mobility");
    });

    test("unknown focus falls back to 'strength'", () => {
      expect(normalizePresetCard({ ...base, focus: "yoga" }).focus).toBe("strength");
    });

    test("null focus falls back to 'strength'", () => {
      expect(normalizePresetCard({ ...base, focus: null }).focus).toBe("strength");
    });

    test("undefined focus falls back to 'strength'", () => {
      expect(normalizePresetCard({ ...base }).focus).toBe("strength");
    });
  });

  describe("duration normalization", () => {
    test("uses provided duration", () => {
      expect(normalizePresetCard({ ...base, duration: "60 min" }).duration).toBe("60 min");
    });

    test("null duration falls back to '30 min'", () => {
      expect(normalizePresetCard({ ...base, duration: null }).duration).toBe("30 min");
    });

    test("undefined duration falls back to '30 min'", () => {
      expect(normalizePresetCard({ ...base }).duration).toBe("30 min");
    });
  });

  describe("steps normalization", () => {
    test("uses provided steps", () => {
      const steps = ["Warm up", "Main lift", "Cool down"];
      expect(normalizePresetCard({ ...base, steps }).steps).toEqual(steps);
    });

    test("null steps falls back to default", () => {
      expect(normalizePresetCard({ ...base, steps: null }).steps).toEqual(["Warm up 5 min"]);
    });

    test("undefined steps falls back to default", () => {
      expect(normalizePresetCard({ ...base }).steps).toEqual(["Warm up 5 min"]);
    });

    test("empty steps array falls back to default", () => {
      expect(normalizePresetCard({ ...base, steps: [] }).steps).toEqual(["Warm up 5 min"]);
    });

    test("single step is kept as-is", () => {
      expect(normalizePresetCard({ ...base, steps: ["Only step"] }).steps).toEqual(["Only step"]);
    });
  });

  describe("id and name passthrough", () => {
    test("preserves id", () => {
      expect(normalizePresetCard({ ...base }).id).toBe("preset-1");
    });

    test("preserves name", () => {
      expect(normalizePresetCard({ ...base, name: "Leg Day" }).name).toBe("Leg Day");
    });
  });

  describe("return shape", () => {
    test("returns all required fields", () => {
      const result = normalizePresetCard(base);
      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("name");
      expect(result).toHaveProperty("focus");
      expect(result).toHaveProperty("duration");
      expect(result).toHaveProperty("steps");
    });

    test("full preset with all fields", () => {
      const result = normalizePresetCard({
        id: "full-1",
        name: "Full Preset",
        focus: "cardio",
        duration: "45 min",
        steps: ["Step 1", "Step 2"],
      });
      expect(result).toEqual({
        id: "full-1",
        name: "Full Preset",
        focus: "cardio",
        duration: "45 min",
        steps: ["Step 1", "Step 2"],
      });
    });
  });
});

describe("movePresetById", () => {
  const presets = [
    { id: "push", name: "Push" },
    { id: "pull", name: "Pull" },
    { id: "legs", name: "Legs" },
  ];

  test("moves a preset up by id", () => {
    expect(movePresetById(presets, "pull", "up").map((p) => p.id)).toEqual([
      "pull",
      "push",
      "legs",
    ]);
  });

  test("moves a preset down by id", () => {
    expect(movePresetById(presets, "pull", "down").map((p) => p.id)).toEqual([
      "push",
      "legs",
      "pull",
    ]);
  });

  test("does not move past list boundaries", () => {
    expect(movePresetById(presets, "push", "up")).toBe(presets);
    expect(movePresetById(presets, "legs", "down")).toBe(presets);
  });

  test("unknown preset id leaves the list unchanged", () => {
    expect(movePresetById(presets, "missing", "up")).toBe(presets);
  });

  test("does not mutate the original list", () => {
    movePresetById(presets, "push", "down");
    expect(presets.map((p) => p.id)).toEqual(["push", "pull", "legs"]);
  });
});

describe("schedule routine persistence", () => {
  test("normalizes a legacy flat routine as the primary slot", () => {
    const result = normalizeScheduleRoutines({
      Mon: "push",
      Tue: null,
      Wed: "",
      Extra: "ignored",
    });

    expect(result.primary.Mon).toBe("push");
    expect(result.primary.Tue).toBeNull();
    expect(result.primary.Wed).toBeNull();
    expect(result.secondary).toEqual(emptyRoutine());
  });

  test("normalizes primary and secondary routine slots", () => {
    const result = normalizeScheduleRoutines({
      primary: { Mon: "push", Tue: "pull" },
      secondary: { Mon: "cardio", Tue: null },
    });

    expect(result.primary.Mon).toBe("push");
    expect(result.primary.Tue).toBe("pull");
    expect(result.secondary.Mon).toBe("cardio");
    expect(result.secondary.Tue).toBeNull();
  });

  test("builds a payload that preserves the second workout per day", () => {
    const primary = normalizeRoutine({ Mon: "push" });
    const secondary = normalizeRoutine({ Mon: "cardio" });

    expect(scheduleRoutinePayload(primary, secondary)).toEqual({
      primary: { ...emptyRoutine(), Mon: "push" },
      secondary: { ...emptyRoutine(), Mon: "cardio" },
    });
  });
});
