<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into the OneRep mobile app. PostHog is initialized in `src/main.tsx` with `PostHogProvider` wrapping the entire app. Users are identified on sign-in and sign-up through Clerk-backed auth state. Ten business-critical events are instrumented across six files covering the full user journey: authentication, onboarding, workout tracking, and food logging (search, AI snap, and barcode).

> **Action required**: Run `bun add posthog-js @posthog/react` in `apps/mobile` to install the PostHog packages (sandbox restrictions prevented automatic installation). Environment variables have already been written to `.env`.

| Event | Description | File |
|---|---|---|
| `user_signed_in` | User successfully signed in with email and password | `src/pages/Login.tsx` |
| `user_signed_up` | User successfully created a new account | `src/pages/Login.tsx` |
| `onboarding_completed` | User completed the onboarding flow (age, height, goal) | `src/pages/Onboarding.tsx` |
| `workout_started` | User started an active workout session | `src/pages/ActiveWorkout.tsx` |
| `workout_completed` | User finished and saved a workout session | `src/pages/ActiveWorkout.tsx` |
| `workout_preset_saved` | User saved a workout preset (create or edit) | `src/pages/NewPreset.tsx` |
| `food_logged` | User added a food item to their diary via search | `src/pages/SearchFoods.tsx` |
| `food_snap_captured` | User took a photo to identify food via AI snap | `src/pages/SnapAndLog.tsx` |
| `food_barcode_scanned` | User scanned a barcode and a food was found | `src/pages/SnapAndLog.tsx` |
| `food_logged_from_camera` | User added a food item via snap or barcode | `src/pages/SnapAndLog.tsx` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard — Analytics basics**: https://us.posthog.com/project/378930/dashboard/1458043
- **Sign-up to Onboarding Completion Funnel**: https://us.posthog.com/project/378930/insights/Ho5PcbNG
- **Workout Completion Rate**: https://us.posthog.com/project/378930/insights/BQmaGfoj
- **New Sign-ups Over Time**: https://us.posthog.com/project/378930/insights/EpEqMyOY
- **Food Logging Activity**: https://us.posthog.com/project/378930/insights/y0ABRhKv
- **Camera Feature Usage**: https://us.posthog.com/project/378930/insights/ftKviFed

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/integration-react-react-router-7-data/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
