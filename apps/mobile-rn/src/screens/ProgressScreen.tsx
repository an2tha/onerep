import { useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import Svg, { Circle, Polyline } from "react-native-svg";
import { Button, Card, Header, Screen } from "@/components/ui";
import { colors, palette, space } from "@/constants/theme";
import { useAppState } from "@/data/AppState";
export function ProgressScreen() {
  const { profile, body, addBody } = useAppState();
  const [weight, setWeight] = useState("");
  const [waist, setWaist] = useState("");
  const min = Math.min(...body.map((b) => b.weightKg)) - 1;
  const max = Math.max(...body.map((b) => b.weightKg)) + 1;
  const points = body.map((b, i) => ({
    x: 20 + i * (260 / Math.max(body.length - 1, 1)),
    y: 120 - ((b.weightKg - min) / (max - min)) * 90,
  }));
  const pts = points.map((p) => `${p.x},${p.y}`).join(" ");
  const last = body.at(-1);
  const first = body[0];
  const delta = last && first ? last.weightKg - first.weightKg : 0;
  return (
    <Screen>
      <ScrollView>
        <Header eyebrow="Progress" title="Trend." />
        <Card>
          <Text style={{ fontSize: 34, fontWeight: "900", color: palette.ink }}>
            {last?.weightKg.toFixed(1)} kg
          </Text>
          <Text style={{ color: palette.muted }}>
            Goal: {profile.goal} • {delta > 0 ? "+" : ""}
            {delta.toFixed(1)} kg since start
          </Text>
          <Svg height={140} width="100%">
            <Polyline
              points={pts}
              fill="none"
              stroke={colors.progress}
              strokeWidth={4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {points.map((p, i) => (
              <Circle key={i} cx={p.x} cy={p.y} r={4} fill={colors.progress} />
            ))}
          </Svg>
        </Card>
        <View style={{ height: space.md }} />
        <Card>
          <Text style={{ fontWeight: "900", fontSize: 18 }}>
            Log measurement
          </Text>
          <TextInput
            value={weight}
            onChangeText={setWeight}
            keyboardType="decimal-pad"
            placeholder="Weight kg"
            style={{
              height: 48,
              borderBottomWidth: 1,
              borderColor: palette.line,
            }}
          />
          <TextInput
            value={waist}
            onChangeText={setWaist}
            keyboardType="decimal-pad"
            placeholder="Waist cm (optional)"
            style={{
              height: 48,
              borderBottomWidth: 1,
              borderColor: palette.line,
            }}
          />
          <Button
            label="Save measurement"
            onPress={() => {
              const n = Number(weight);
              const w = Number(waist);
              if (n > 0) {
                addBody(n, w > 0 ? w : undefined);
                setWeight("");
                setWaist("");
              }
            }}
            tone={colors.progress}
          />
        </Card>
        <View style={{ height: space.md }} />
        <Card>
          <Text style={{ fontWeight: "900", fontSize: 18 }}>History</Text>
          {body
            .slice()
            .reverse()
            .map((b) => (
              <View
                key={b.id}
                style={{
                  paddingVertical: 10,
                  flexDirection: "row",
                  justifyContent: "space-between",
                  borderTopWidth: 1,
                  borderColor: palette.line,
                }}
              >
                <Text style={{ fontWeight: "800" }}>{b.date}</Text>
                <Text>
                  {b.weightKg.toFixed(1)} kg
                  {b.waistCm ? ` · ${b.waistCm} cm` : ""}
                </Text>
              </View>
            ))}
        </Card>
      </ScrollView>
    </Screen>
  );
}
