import * as Haptics from "expo-haptics";
import { ScrollView, Text, View, Pressable } from "react-native";
import { Button, Card, Header, ProgressBar, Screen } from "@/components/ui";
import { colors, palette, space } from "@/constants/theme";
import { useAppState } from "@/data/AppState";
import { pct } from "@/utils/math";
export function ActiveWorkoutScreen() {
  const { presets, toggleSet, addSet, finishWorkout } = useAppState();
  const preset = presets[0];
  const sets = preset.exercises.flatMap((e) => e.sets);
  const done = sets.filter((s) => s.done).length;
  return (
    <Screen>
      <ScrollView>
        <Header eyebrow="Active" title={preset.name} />
        <Card>
          <Text style={{ fontSize: 32, fontWeight: "900", color: palette.ink }}>
            {done}/{sets.length}
          </Text>
          <Text style={{ color: palette.muted }}>sets complete</Text>
          <View style={{ marginTop: 12 }}>
            <ProgressBar
              value={pct(done, sets.length)}
              color={colors.workout}
            />
          </View>
        </Card>
        <View style={{ height: space.md }} />
        {preset.exercises.map((e) => (
          <Card key={e.id} style={{ marginBottom: space.md }}>
            <View
              style={{ flexDirection: "row", justifyContent: "space-between" }}
            >
              <Text style={{ fontSize: 19, fontWeight: "900" }}>{e.name}</Text>
              <Pressable onPress={() => addSet(e.id)}>
                <Text style={{ fontWeight: "900", color: colors.workout }}>
                  + set
                </Text>
              </Pressable>
            </View>
            {e.sets.map((s, idx) => (
              <Pressable
                key={s.id}
                onPress={() => {
                  Haptics.notificationAsync(
                    Haptics.NotificationFeedbackType.Success,
                  );
                  toggleSet(e.id, s.id);
                }}
                style={{
                  marginTop: 10,
                  padding: 14,
                  borderRadius: 16,
                  backgroundColor: s.done ? "#e5ebe2" : "#f5eee4",
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                <Text style={{ fontWeight: "900" }}>
                  Set {idx + 1} {s.done ? "✓" : ""}
                </Text>
                <Text>
                  {s.weight} kg × {s.reps} · rest {s.restSeconds}s
                </Text>
              </Pressable>
            ))}
          </Card>
        ))}
        <Button
          label="Finish workout"
          tone={colors.good}
          onPress={() => finishWorkout(preset.id)}
        />
        <View style={{ height: space.xl }} />
      </ScrollView>
    </Screen>
  );
}
