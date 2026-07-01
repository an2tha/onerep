import { ScrollView, Text, View, Pressable } from "react-native";
import { Button, Card, Header, ProgressBar, Screen } from "@/components/ui";
import { colors, palette, space } from "@/constants/theme";
import { useAppState } from "@/data/AppState";
import { pct } from "@/utils/math";
export function WaterScreen() {
  const { profile, water, addWater, deleteWater } = useAppState();
  const total = water.reduce((a, w) => a + w.amountMl, 0);
  return (
    <Screen>
      <ScrollView>
        <Header eyebrow="Hydration" title="Water." />
        <Card>
          <Text style={{ fontSize: 40, fontWeight: "900", color: palette.ink }}>
            {total} ml
          </Text>
          <Text style={{ color: palette.muted }}>
            Target {profile.waterTargetMl} ml
          </Text>
          <View style={{ marginTop: 14 }}>
            <ProgressBar
              value={pct(total, profile.waterTargetMl)}
              color={colors.water}
            />
          </View>
        </Card>
        <View style={{ height: space.md }} />
        <View style={{ flexDirection: "row", gap: 8 }}>
          {[150, 250, 500, 750, 1000].map((ml) => (
            <Button
              key={ml}
              label={`+${ml}`}
              onPress={() => addWater(ml)}
              tone={colors.water}
            />
          ))}
        </View>
        <View style={{ height: space.md }} />
        <Card>
          <Text style={{ fontWeight: "900", fontSize: 18 }}>Log</Text>
          {water.map((w) => (
            <Pressable
              key={w.id}
              onLongPress={() => deleteWater(w.id)}
              style={{
                paddingVertical: 12,
                flexDirection: "row",
                justifyContent: "space-between",
                borderTopWidth: 1,
                borderColor: palette.line,
              }}
            >
              <Text style={{ fontWeight: "800" }}>{w.amountMl} ml</Text>
              <Text style={{ color: palette.muted }}>{w.time}</Text>
            </Pressable>
          ))}
        </Card>
      </ScrollView>
    </Screen>
  );
}
