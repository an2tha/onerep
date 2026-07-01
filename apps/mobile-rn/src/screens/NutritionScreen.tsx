import { useMemo, useState } from "react";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Button, Card, Header, ProgressBar, Screen } from "@/components/ui";
import { colors, palette, space } from "@/constants/theme";
import { mealLabel, useAppState } from "@/data/AppState";
import { foods as catalog } from "@/data/seed";
import type { Meal } from "@/types/domain";
import type { RootStackParamList } from "@/navigation/AppNavigator";
import { macroTotals, pct } from "@/utils/math";
const meals: Meal[] = ["breakfast", "lunch", "dinner", "snack"];
export function NutritionScreen() {
  const {
    profile,
    foods,
    addFood,
    deleteFood,
    water,
    addWater,
    supplements,
    toggleSupplement,
  } = useAppState();
  const [query, setQuery] = useState("");
  const [meal, setMeal] = useState<Meal>("snack");
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const totals = macroTotals(foods);
  const matches = useMemo(
    () =>
      catalog
        .filter((f) => f.name.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 5),
    [query],
  );
  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Header eyebrow="Nutrition" title="Fuel." />
        <Card>
          <Text style={{ fontSize: 28, fontWeight: "900", color: palette.ink }}>
            {totals.calories} kcal
          </Text>
          <ProgressBar
            value={pct(totals.calories, profile.calorieTarget)}
            color={colors.food}
          />
          <Text style={{ marginTop: 10, color: palette.muted }}>
            P {totals.protein}g C {totals.carbs}g F {totals.fat}g
          </Text>
        </Card>
        <View style={{ height: space.md }} />
        <Card>
          <Text style={{ fontWeight: "900", fontSize: 18 }}>
            Search and log food
          </Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Chicken, yogurt, salmon..."
            style={{
              height: 48,
              borderBottomWidth: 1,
              borderColor: palette.line,
            }}
          />
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
              marginVertical: 12,
            }}
          >
            {meals.map((m) => (
              <Pressable
                key={m}
                onPress={() => setMeal(m)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: meal === m ? palette.ink : "#efe6d8",
                }}
              >
                <Text
                  style={{
                    color: meal === m ? palette.paper : palette.ink,
                    fontWeight: "800",
                  }}
                >
                  {mealLabel(m)}
                </Text>
              </Pressable>
            ))}
          </View>
          {(query ? matches : catalog.slice(0, 3)).map((item) => (
            <Pressable
              key={item.name}
              onPress={() => {
                addFood({ ...item, meal });
                setQuery("");
              }}
              style={{
                paddingVertical: 12,
                borderTopWidth: 1,
                borderColor: palette.line,
              }}
            >
              <Text style={{ fontWeight: "900", color: palette.ink }}>
                {item.name}
              </Text>
              <Text style={{ color: palette.muted }}>
                {item.calories} kcal • {item.protein}g protein
              </Text>
            </Pressable>
          ))}
          <Button
            label="Custom 320 kcal item"
            onPress={() => {
              if (!query.trim()) return Alert.alert("Food name required");
              addFood({
                name: query,
                meal,
                calories: 320,
                protein: 24,
                carbs: 32,
                fat: 10,
              });
              setQuery("");
            }}
          />
        </Card>
        <View style={{ height: space.md }} />
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button
            label="Recipes"
            onPress={() => navigation.navigate("Recipes")}
            tone={palette.ink}
          />
          <Button
            label="Scan"
            onPress={() => navigation.navigate("CameraLog")}
            tone={colors.food}
          />
        </View>
        <View style={{ height: space.md }} />
        <Card>
          <Text style={{ fontWeight: "900", fontSize: 18 }}>Today’s log</Text>
          {foods.map((f) => (
            <Pressable
              key={f.id}
              onLongPress={() => deleteFood(f.id)}
              style={{
                paddingVertical: 12,
                flexDirection: "row",
                justifyContent: "space-between",
                borderTopWidth: 1,
                borderColor: palette.line,
              }}
            >
              <View>
                <Text style={{ fontWeight: "800" }}>{f.name}</Text>
                <Text style={{ color: palette.muted }}>
                  {mealLabel(f.meal)} · {f.time}
                </Text>
              </View>
              <Text style={{ fontWeight: "900" }}>{f.calories}</Text>
            </Pressable>
          ))}
        </Card>
        <View style={{ height: space.md }} />
        <Card>
          <Text style={{ fontWeight: "900", fontSize: 18 }}>Water</Text>
          <Text style={{ color: palette.muted, marginVertical: 8 }}>
            {water.reduce((a, w) => a + w.amountMl, 0)} /{" "}
            {profile.waterTargetMl} ml
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {[250, 500, 750].map((ml) => (
              <Button
                key={ml}
                label={`+${ml}`}
                onPress={() => addWater(ml)}
                tone={colors.water}
              />
            ))}
          </View>
        </Card>
        <View style={{ height: space.md }} />
        <Card>
          <Text style={{ fontWeight: "900", fontSize: 18 }}>Supplements</Text>
          {supplements.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => toggleSupplement(s.id)}
              style={{
                paddingVertical: 12,
                flexDirection: "row",
                justifyContent: "space-between",
              }}
            >
              <Text style={{ fontWeight: "700" }}>
                {s.name} · {s.dose}
              </Text>
              <Text>{s.taken ? "Taken" : "Open"}</Text>
            </Pressable>
          ))}
        </Card>
        <View style={{ height: space.xl }} />
      </ScrollView>
    </Screen>
  );
}
