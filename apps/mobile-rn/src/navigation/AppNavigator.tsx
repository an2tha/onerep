import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { palette } from "@/constants/theme";
import { useAppState } from "@/data/AppState";
import { ActiveWorkoutScreen } from "@/screens/ActiveWorkoutScreen";
import { CameraLogScreen } from "@/screens/CameraLogScreen";
import { FoodSearchScreen } from "@/screens/FoodSearchScreen";
import { LoginScreen } from "@/screens/LoginScreen";
import { OnboardingScreen } from "@/screens/OnboardingScreen";
import { PresetBuilderScreen } from "@/screens/PresetBuilderScreen";
import { ProgressScreen } from "@/screens/ProgressScreen";
import { RecipesScreen } from "@/screens/RecipesScreen";
import { SettingsScreen } from "@/screens/SettingsScreen";
import { SupplementsScreen } from "@/screens/SupplementsScreen";
import { TodayScreen } from "@/screens/TodayScreen";
import { NutritionScreen } from "@/screens/NutritionScreen";
import { WaterScreen } from "@/screens/WaterScreen";
import { WorkoutsScreen } from "@/screens/WorkoutsScreen";
export type RootStackParamList = {
  Login: undefined;
  Tabs: undefined;
  Onboarding: undefined;
  CameraLog: undefined;
  ActiveWorkout: undefined;
  Water: undefined;
  Supplements: undefined;
  Recipes: undefined;
  FoodSearch: undefined;
  PresetBuilder: undefined;
};
const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator<RootStackParamList>();
function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: palette.ink,
        tabBarInactiveTintColor: palette.muted,
        tabBarStyle: {
          backgroundColor: "#fffaf2",
          borderTopColor: palette.line,
          height: 84,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontWeight: "700" },
        tabBarIcon: ({ color, size }) => {
          const names: Record<string, keyof typeof Ionicons.glyphMap> = {
            Today: "home",
            Nutrition: "restaurant",
            Workouts: "barbell",
            Progress: "analytics",
            Settings: "settings",
          };
          return (
            <Ionicons name={names[route.name]} size={size} color={color} />
          );
        },
      })}
    >
      <Tab.Screen name="Today" component={TodayScreen} />
      <Tab.Screen name="Nutrition" component={NutritionScreen} />
      <Tab.Screen name="Workouts" component={WorkoutsScreen} />
      <Tab.Screen name="Progress" component={ProgressScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}
export function AppNavigator() {
  const { auth } = useAppState();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!auth.isAuthenticated ? (
        <Stack.Screen name="Login" component={LoginScreen} />
      ) : (
        <>
          <Stack.Screen name="Tabs" component={Tabs} />
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
          <Stack.Screen name="CameraLog" component={CameraLogScreen} />
          <Stack.Screen name="ActiveWorkout" component={ActiveWorkoutScreen} />
          <Stack.Screen name="Water" component={WaterScreen} />
          <Stack.Screen name="Supplements" component={SupplementsScreen} />
          <Stack.Screen name="Recipes" component={RecipesScreen} />
          <Stack.Screen name="FoodSearch" component={FoodSearchScreen} />
          <Stack.Screen name="PresetBuilder" component={PresetBuilderScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}
