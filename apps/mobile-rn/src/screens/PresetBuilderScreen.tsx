import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Button, Card, Header, Screen } from "@/components/ui";
import { colors, palette, space } from "@/constants/theme";
import { useAppState } from "@/data/AppState";
import { exercises } from "@/data/seed";
export function PresetBuilderScreen() {
  const { presets, createPreset, deletePreset, addExercise } = useAppState();
  const [name, setName] = useState("");
  const [selected, setSelected] = useState(presets[0]?.id ?? "");
  const preset = presets.find((p) => p.id === selected) ?? presets[0];
  return (
    <Screen>
      <ScrollView>
        <Header eyebrow="Builder" title="Presets." />
        <Card>
          <Text style={{ fontWeight: "900", fontSize: 18 }}>Create preset</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Push, Pull, Legs..."
            style={{
              height: 48,
              borderBottomWidth: 1,
              borderColor: palette.line,
            }}
          />
          <Button
            label="Create"
            onPress={() => {
              if (name.trim()) {
                createPreset(name);
                setName("");
              }
            }}
            tone={colors.workout}
          />
        </Card>
        <View style={{ height: space.md }} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {presets.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => setSelected(p.id)}
              onLongPress={() => deletePreset(p.id)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor:
                  preset?.id === p.id ? palette.ink : palette.card,
              }}
            >
              <Text
                style={{
                  fontWeight: "800",
                  color: preset?.id === p.id ? palette.paper : palette.ink,
                }}
              >
                {p.name}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={{ height: space.md }} />
        {preset ? (
          <Card>
            <Text style={{ fontSize: 20, fontWeight: "900" }}>
              {preset.name}
            </Text>
            {preset.exercises.map((e) => (
              <Text key={e.id} style={{ paddingVertical: 5 }}>
                • {e.name} · {e.sets.length} sets
              </Text>
            ))}
            <Text style={{ marginTop: 12, fontWeight: "900" }}>
              Add exercise
            </Text>
            {exercises.slice(0, 10).map((e) => (
              <Pressable
                key={e}
                onPress={() => addExercise(preset.id, e)}
                style={{
                  paddingVertical: 10,
                  borderTopWidth: 1,
                  borderColor: palette.line,
                }}
              >
                <Text>{e}</Text>
              </Pressable>
            ))}
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
