import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Button, Card, Header, Screen } from "@/components/ui";
import { palette, space } from "@/constants/theme";
import { mealLabel, useAppState } from "@/data/AppState";
import type { Meal } from "@/types/domain";
const meals: Meal[] = ["breakfast", "lunch", "dinner", "snack"];
export function RecipesScreen() {
  const { recipes, addRecipe, logRecipe } = useAppState();
  const [name, setName] = useState("");
  const [meal, setMeal] = useState<Meal>("dinner");
  return (
    <Screen>
      <ScrollView>
        <Header eyebrow="Recipes" title="Meals." />
        <Card>
          <Text style={{ fontWeight: "900", fontSize: 18 }}>New recipe</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Recipe name"
            style={{
              height: 48,
              borderBottomWidth: 1,
              borderColor: palette.line,
            }}
          />
          <Button
            label="Create recipe"
            onPress={() => {
              if (name.trim()) {
                addRecipe(name);
                setName("");
              }
            }}
          />
        </Card>
        <View style={{ height: space.md }} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {meals.map((m) => (
            <Pressable
              key={m}
              onPress={() => setMeal(m)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: meal === m ? palette.ink : palette.card,
              }}
            >
              <Text
                style={{
                  fontWeight: "800",
                  color: meal === m ? palette.paper : palette.ink,
                }}
              >
                {mealLabel(m)}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={{ height: space.md }} />
        {recipes.map((r) => {
          const totals = r.ingredients.reduce(
            (a, i) => ({
              calories: a.calories + i.calories,
              protein: a.protein + i.protein,
              carbs: a.carbs + i.carbs,
              fat: a.fat + i.fat,
            }),
            { calories: 0, protein: 0, carbs: 0, fat: 0 },
          );
          return (
            <Card key={r.id} style={{ marginBottom: space.md }}>
              <Text
                style={{ fontSize: 20, fontWeight: "900", color: palette.ink }}
              >
                {r.name}
              </Text>
              <Text style={{ color: palette.muted, marginVertical: 8 }}>
                {r.servings} servings · {totals.calories} kcal ·{" "}
                {totals.protein}g protein
              </Text>
              {r.ingredients.map((i) => (
                <Text key={i.id} style={{ paddingVertical: 4 }}>
                  • {i.name} · {i.grams}g
                </Text>
              ))}
              <Button
                label={`Log to ${mealLabel(meal)}`}
                onPress={() => logRecipe(r.id, meal)}
              />
            </Card>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
