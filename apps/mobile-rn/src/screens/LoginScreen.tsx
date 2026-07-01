import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { Button, Card, Header, Hero, Screen } from "@/components/ui";
import { palette, space } from "@/constants/theme";
import { useAppState } from "@/data/AppState";
export function LoginScreen() {
  const { signIn } = useAppState();
  const [email, setEmail] = useState("alex@onerep.app");
  return (
    <Screen>
      <Header eyebrow="OneRep" title="Sign in." />
      <Hero>
        <Text style={{ fontSize: 18, lineHeight: 28, color: palette.ink }}>
          Native auth shell for sign in, sign up, and verified-account entry.
          Wire this to Clerk Expo when production keys are provided.
        </Text>
      </Hero>
      <View style={{ height: space.md }} />
      <Card>
        <TextInput
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          style={{
            height: 52,
            borderBottomWidth: 1,
            borderColor: palette.line,
          }}
        />
        <Button
          label="Continue"
          onPress={() => signIn(email.trim() || "alex@onerep.app")}
        />
        <Text style={{ marginTop: 12, color: palette.muted }}>
          Demo mode signs in locally but preserves the production auth boundary.
        </Text>
      </Card>
    </Screen>
  );
}
