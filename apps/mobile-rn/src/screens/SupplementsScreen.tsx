import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Button, Card, Header, Screen } from "@/components/ui";
import { colors, palette, space } from "@/constants/theme";
import { useAppState } from "@/data/AppState";
export function SupplementsScreen() {
  const { supplements, toggleSupplement, addSupplement, deleteSupplement } =
    useAppState();
  const [name, setName] = useState("");
  const [dose, setDose] = useState("");
  return (
    <Screen>
      <ScrollView>
        <Header eyebrow="Supplements" title="Stack." />
        <Card>
          <Text style={{ fontWeight: "900", fontSize: 18 }}>
            Add supplement
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Name"
            style={{
              height: 48,
              borderBottomWidth: 1,
              borderColor: palette.line,
            }}
          />
          <TextInput
            value={dose}
            onChangeText={setDose}
            placeholder="Dose"
            style={{
              height: 48,
              borderBottomWidth: 1,
              borderColor: palette.line,
            }}
          />
          <Button
            label="Add"
            tone={colors.good}
            onPress={() => {
              if (name.trim()) {
                addSupplement(name, dose || "1 serving");
                setName("");
                setDose("");
              }
            }}
          />
        </Card>
        <View style={{ height: space.md }} />
        <Card>
          <Text style={{ fontWeight: "900", fontSize: 18 }}>Today</Text>
          {supplements.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => toggleSupplement(s.id)}
              onLongPress={() => deleteSupplement(s.id)}
              style={{
                paddingVertical: 14,
                borderTopWidth: 1,
                borderColor: palette.line,
                flexDirection: "row",
                justifyContent: "space-between",
              }}
            >
              <View>
                <Text style={{ fontWeight: "900" }}>{s.name}</Text>
                <Text style={{ color: palette.muted }}>
                  {s.dose} · {s.schedule}
                </Text>
              </View>
              <Text
                style={{
                  fontWeight: "900",
                  color: s.taken ? colors.good : palette.muted,
                }}
              >
                {s.taken ? "Taken" : "Open"}
              </Text>
            </Pressable>
          ))}
        </Card>
      </ScrollView>
    </Screen>
  );
}
