import { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Button, Card, Header, Screen } from "@/components/ui";
import { palette, space } from "@/constants/theme";
import { useAppState } from "@/data/AppState";
export function SettingsScreen() {
  const {
    auth,
    profile,
    reminders,
    toggleReminder,
    updateProfile,
    resetDemo,
    signOut,
  } = useAppState();
  const [name, setName] = useState(profile.name);
  const [cal, setCal] = useState(String(profile.calorieTarget));
  return (
    <Screen>
      <ScrollView>
        <Header eyebrow="OneRep" title="Settings." />
        <Card>
          <Text style={{ fontWeight: "900", fontSize: 18 }}>Account</Text>
          <Text style={{ color: palette.muted, marginTop: 8 }}>
            {auth.email ?? "Signed out"}
          </Text>
          <Button label="Sign out" onPress={signOut} />
        </Card>
        <View style={{ height: space.md }} />
        <Card>
          <Text style={{ fontWeight: "900", fontSize: 18 }}>Profile</Text>
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
            value={cal}
            onChangeText={setCal}
            keyboardType="number-pad"
            placeholder="Calories"
            style={{
              height: 48,
              borderBottomWidth: 1,
              borderColor: palette.line,
            }}
          />
          <Button
            label="Save profile"
            onPress={() =>
              updateProfile({
                name,
                calorieTarget: Number(cal) || profile.calorieTarget,
              })
            }
          />
        </Card>
        <View style={{ height: space.md }} />
        <Card>
          <Text style={{ fontWeight: "900", fontSize: 18 }}>Training days</Text>
          <Text style={{ color: palette.muted, marginTop: 8 }}>
            {profile.trainingDays.join(" · ")}
          </Text>
        </Card>
        <View style={{ height: space.md }} />
        <Card>
          <Text style={{ fontWeight: "900", fontSize: 18 }}>Reminders</Text>
          {reminders.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => toggleReminder(r.id)}
              style={{
                paddingVertical: 10,
                flexDirection: "row",
                justifyContent: "space-between",
                borderTopWidth: 1,
                borderColor: palette.line,
              }}
            >
              <Text style={{ fontWeight: "800" }}>
                {r.label} · {r.time}
              </Text>
              <Text>{r.enabled ? "On" : "Off"}</Text>
            </Pressable>
          ))}
        </Card>
        <View style={{ height: space.md }} />
        <Card>
          <Text style={{ fontWeight: "900", fontSize: 18 }}>
            Backend readiness
          </Text>
          <Text style={{ color: palette.muted, marginTop: 8 }}>
            The app is native-first and persists offline locally. Convex is
            installed in this workspace for swapping the local provider to live
            queries/mutations when mobile auth keys are configured.
          </Text>
        </Card>
        <View style={{ height: space.md }} />
        <Pressable
          onPress={() =>
            Alert.alert(
              "Reset demo data?",
              "This restores the local seed state.",
              [
                { text: "Cancel" },
                { text: "Reset", style: "destructive", onPress: resetDemo },
              ],
            )
          }
        >
          <Text
            style={{
              color: palette.cordovan,
              fontWeight: "900",
              textAlign: "center",
              padding: 18,
            }}
          >
            Reset demo data
          </Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}
