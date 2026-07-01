import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Button, Card, Header, ProgressBar, Screen } from "@/components/ui";
import { colors, palette, space } from "@/constants/theme";
import { useAppState } from "@/data/AppState";
import { exercises as library } from "@/data/seed";
import type { RootStackParamList } from "@/navigation/AppNavigator";
import { pct } from "@/utils/math";
export function WorkoutsScreen() {
  const { presets, toggleSet, addSet, addExercise } = useAppState();
  const [search, setSearch] = useState("");
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const preset = presets[0];
  const allSets = preset.exercises.flatMap((e) => e.sets);
  const completed = allSets.filter((s) => s.done).length;
  const matches = useMemo(
    () =>
      library
        .filter((e) => e.toLowerCase().includes(search.toLowerCase()))
        .slice(0, 6),
    [search],
  );
  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Header eyebrow="Training" title="Lift." />
        <Card>
          <Text style={{ fontSize: 24, fontWeight: "900", color: palette.ink }}>
            {preset.name}
          </Text>
          <Text style={{ color: palette.muted, marginBottom: 12 }}>
            {preset.duration} • {preset.focus} • {completed}/{allSets.length}{" "}
            sets
          </Text>
          <ProgressBar
            value={pct(completed, allSets.length)}
            color={colors.workout}
          />
          <View style={{ height: 12 }} />
          <Button
            label="Open active workout"
            onPress={() => navigation.navigate("ActiveWorkout")}
            tone={colors.workout}
          />
          <View style={{ height: 10 }} />
          <Button
            label="Edit presets"
            onPress={() => navigation.navigate("PresetBuilder")}
          />
        </Card>
        <View style={{ height: space.md }} />
        {preset.exercises.map((e) => (
          <Card key={e.id} style={{ marginBottom: space.md }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <View>
                <Text style={{ fontWeight: "900", fontSize: 19 }}>
                  {e.name}
                </Text>
                <Text style={{ color: palette.muted }}>{e.muscle}</Text>
              </View>
              <Pressable onPress={() => addSet(e.id)}>
                <Text style={{ color: colors.workout, fontWeight: "900" }}>
                  + set
                </Text>
              </Pressable>
            </View>
            {e.sets.map((s, i) => (
              <Pressable
                key={s.id}
                onPress={() => {
                  Haptics.selectionAsync();
                  toggleSet(e.id, s.id);
                }}
                style={{
                  marginTop: 8,
                  padding: 12,
                  borderRadius: 14,
                  backgroundColor: s.done ? "#e5ebe2" : "#f5eee4",
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                <Text
                  style={{
                    fontWeight: "800",
                    color: s.done ? colors.good : palette.ink,
                  }}
                >
                  Set {i + 1} {s.done ? "✓" : ""}
                </Text>
                <Text>
                  {s.weight} kg × {s.reps}
                  {s.rpe ? ` @${s.rpe}` : ""}
                </Text>
              </Pressable>
            ))}
          </Card>
        ))}
        <Card>
          <Text style={{ fontWeight: "900", fontSize: 18 }}>
            Exercise library
          </Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Add an exercise"
            style={{
              height: 48,
              borderBottomWidth: 1,
              borderColor: palette.line,
            }}
          />
          {(search ? matches : library.slice(0, 4)).map((name) => (
            <Pressable
              key={name}
              onPress={() => {
                addExercise(preset.id, name);
                setSearch("");
              }}
              style={{
                paddingVertical: 12,
                borderTopWidth: 1,
                borderColor: palette.line,
              }}
            >
              <Text style={{ fontWeight: "800" }}>{name}</Text>
            </Pressable>
          ))}
        </Card>
        <View style={{ height: space.xl }} />
      </ScrollView>
    </Screen>
  );
}
