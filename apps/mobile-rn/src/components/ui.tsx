import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { palette, radius, space } from "@/constants/theme";
export function Screen({ children }: { children: ReactNode }) {
  return <View style={styles.screen}>{children}</View>;
}
export function Header({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      <View>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.title}>{title}</Text>
      </View>
      {action}
    </View>
  );
}
export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}
export function Button({
  label,
  onPress,
  tone = palette.ink,
}: {
  label: string;
  onPress?: () => void;
  tone?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: tone, opacity: pressed ? 0.75 : 1 },
      ]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}
export function ProgressBar({
  value,
  color = palette.ink,
}: {
  value: number;
  color?: string;
}) {
  return (
    <View style={styles.track}>
      <View
        style={[
          styles.fill,
          { width: `${Math.round(value * 100)}%`, backgroundColor: color },
        ]}
      />
    </View>
  );
}
export function Hero({ children }: { children: ReactNode }) {
  return (
    <LinearGradient colors={["#fffaf2", "#eee7db"]} style={styles.hero}>
      {children}
    </LinearGradient>
  );
}
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.paper,
    paddingHorizontal: space.md,
  },
  header: {
    paddingTop: 14,
    paddingBottom: space.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  eyebrow: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  title: {
    color: palette.ink,
    fontSize: 34,
    lineHeight: 38,
    fontWeight: "800",
    letterSpacing: -1.1,
  },
  card: {
    backgroundColor: palette.card,
    borderColor: palette.line,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: space.md,
    shadowColor: palette.rubber,
    shadowOpacity: 0.07,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  button: {
    borderRadius: radius.pill,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  buttonText: { color: palette.paper, fontWeight: "800", fontSize: 15 },
  track: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "#e7ded1",
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: 999 },
  hero: {
    borderRadius: radius.lg,
    padding: space.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.line,
  },
});
