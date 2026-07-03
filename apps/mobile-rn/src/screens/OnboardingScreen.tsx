import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button, Header, Hero, Screen } from "@/components/ui";
import { palette, space } from "@/constants/theme";
import { useAppState } from "@/data/AppState";
import type { RootStackParamList } from "@/navigation/AppNavigator";
const goals = [
  { id: "lose", label: "Lose fat" },
  { id: "build", label: "Build muscle" },
  { id: "maintain", label: "Maintain" },
  { id: "perform", label: "Perform" },
] as const;
export function OnboardingScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, "Onboarding">) {
  const { updateProfile } = useAppState();
  const [goal, setGoal] = useState<(typeof goals)[number]["id"]>("build");
  return (
    <Screen>
      <Header eyebrow="Start" title="Build your baseline." />
      <Hero>
        <Text style={{ fontSize: 18, lineHeight: 28 }}>
          Pick a target and OneRep sets calories, protein, water, supplements,
          and a first training split. You can adjust every number later.
        </Text>
      </Hero>
      <View style={{ height: space.md }} />
      {goals.map((g) => (
        <Pressable
          key={g.id}
          onPress={() => setGoal(g.id)}
          style={{
            padding: 18,
            borderRadius: 18,
            backgroundColor: goal === g.id ? palette.ink : palette.card,
            marginBottom: 10,
          }}
        >
          <Text
            style={{
              color: goal === g.id ? palette.paper : palette.ink,
              fontWeight: "900",
              fontSize: 17,
            }}
          >
            {g.label}
          </Text>
        </Pressable>
      ))}
      <Button
        label="Continue"
        onPress={() => {
          updateProfile({ goal, hasCompletedOnboarding: true });
          navigation.replace("Tabs");
        }}
      />
    </Screen>
  );
}
