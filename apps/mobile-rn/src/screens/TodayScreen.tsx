import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScrollView, Text, View } from "react-native";
import {
  Button,
  Card,
  Header,
  Hero,
  ProgressBar,
  Screen,
} from "@/components/ui";
import { colors, palette, space } from "@/constants/theme";
import { useAppState } from "@/data/AppState";
import type { RootStackParamList } from "@/navigation/AppNavigator";
import { macroTotals, pct } from "@/utils/math";

export function TodayScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { profile, foods, water, supplements, presets } = useAppState();
  const totals = macroTotals(foods);
  const waterMl = water.reduce((a, w) => a + w.amountMl, 0);
  const doneSupps = supplements.filter((s) => s.taken).length;
  const workout = presets[0];
  const completeSets = workout.exercises
    .flatMap((e) => e.sets)
    .filter((s) => s.done).length;
  const totalSets = workout.exercises.flatMap((e) => e.sets).length;
  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Header eyebrow="Today" title={`Ready, ${profile.name}.`} />
        <Hero>
          <Text style={{ color: palette.muted, fontWeight: "800" }}>
            Daily ledger
          </Text>
          <Text
            style={{
              fontSize: 52,
              fontWeight: "900",
              color: palette.ink,
              letterSpacing: -2,
            }}
          >
            {totals.calories}
          </Text>
          <Text style={{ color: palette.muted }}>
            of {profile.calorieTarget.toLocaleString()} kcal • {totals.protein}
            g/{profile.proteinTarget}g protein
          </Text>
          <View style={{ marginTop: 14 }}>
            <ProgressBar
              value={pct(totals.calories, profile.calorieTarget)}
              color={colors.food}
            />
          </View>
        </Hero>
        <View style={{ height: space.md }} />
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Card style={{ flex: 1 }}>
            <Text
              style={{ fontWeight: "900", fontSize: 22, color: palette.ink }}
            >
              {Math.round(waterMl / 250)}/
              {Math.round(profile.waterTargetMl / 250)}
            </Text>
            <Text style={{ color: palette.muted }}>water glasses</Text>
          </Card>
          <Card style={{ flex: 1 }}>
            <Text
              style={{ fontWeight: "900", fontSize: 22, color: palette.ink }}
            >
              {doneSupps}/{supplements.length}
            </Text>
            <Text style={{ color: palette.muted }}>supplements</Text>
          </Card>
        </View>
        <View style={{ height: space.md }} />
        <Card>
          <Text style={{ fontSize: 20, fontWeight: "900", color: palette.ink }}>
            {workout.name}
          </Text>
          <Text style={{ color: palette.muted, marginTop: 4 }}>
            {workout.duration} • {completeSets}/{totalSets} sets complete
          </Text>
          <View style={{ marginVertical: 14 }}>
            <ProgressBar
              value={pct(completeSets, totalSets)}
              color={colors.workout}
            />
          </View>
          {workout.exercises.map((e) => (
            <Text
              key={e.id}
              style={{ marginTop: 8, color: palette.ink, fontWeight: "700" }}
            >
              • {e.name} · {e.sets.length} sets
            </Text>
          ))}
        </Card>
        <View style={{ height: space.md }} />
        <Button
          label="Snap or scan food"
          onPress={() => navigation.navigate("CameraLog")}
          tone={palette.ink}
        />
        <View style={{ height: space.xl }} />
      </ScrollView>
    </Screen>
  );
}
