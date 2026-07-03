import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput } from "react-native";
import { Card, Header, Screen } from "@/components/ui";
import { palette } from "@/constants/theme";
import { mealLabel, useAppState } from "@/data/AppState";
import { foods as catalog } from "@/data/seed";
import type { Meal } from "@/types/domain";
export function FoodSearchScreen() {
  const { addFood } = useAppState();
  const [query, setQuery] = useState("");
  const [meal] = useState<Meal>("snack");
  const results = useMemo(
    () =>
      catalog
        .filter((f) => f.name.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 12),
    [query],
  );
  return (
    <Screen>
      <ScrollView>
        <Header eyebrow="Foods" title="Search." />
        <Card>
          <TextInput
            value={query}
            onChangeText={setQuery}
            autoFocus
            placeholder="Search foods"
            style={{
              height: 52,
              borderBottomWidth: 1,
              borderColor: palette.line,
            }}
          />
          {(query ? results : catalog).map((f) => (
            <Pressable
              key={f.name}
              onPress={() => addFood({ ...f, meal })}
              style={{
                paddingVertical: 14,
                borderTopWidth: 1,
                borderColor: palette.line,
              }}
            >
              <Text style={{ fontWeight: "900" }}>{f.name}</Text>
              <Text style={{ color: palette.muted }}>
                {mealLabel(meal)} · {f.calories} kcal · P {f.protein} C{" "}
                {f.carbs} F {f.fat}
              </Text>
            </Pressable>
          ))}
        </Card>
      </ScrollView>
    </Screen>
  );
}
