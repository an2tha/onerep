# Workout import formats

Onboarding accepts up to three CSV or JSON files totalling 5 MB. The preview identifies a built-in parser by exact column names, not filenames. Supported mappings are in `convex/lib/importPresets.ts`:

| Format | JSON shape |
| --- | --- |
| Hevy API | `{ "workouts": [{ "start_time": "…", "title": "…", "exercises": [{ "title": "…", "sets": [{ "weight_kg": 20, "reps": 10 }] }] }] }` |
| Hevy export | Array of rows with `start_time`, `exercise_title`, `weight_kg`, `reps` |
| Strong | Array of rows with `Date`, `Workout Name`, `Exercise Name`, `Weight`, `Reps`; optional `Weight Unit`, `RPE`, `Set Type` |
| FitNotes | Array of rows with `Date`, `Exercise`, `Weight (kg)` or `Weight (lbs)`, `Reps` |
| Generic workout JSON | `workouts` array with `date`, `title`, `exercises[].name`, `exercises[].sets[].weight_kg` and `reps` |

Strong and FitNotes JSON support means JSON containing their export columns; it is not a claim that those apps have native JSON exports. CSV rows use the same maps. A downloadable generic example ships at `/imports/workout-template.json`.

Built-in mappings do not consume AI credits. Unrecognized formats retain the existing AI/header fallback. Explicit row units take precedence over column/default units. Choose the original export's weight unit when it does not label its weights, especially for Strong.

The existing importer retains dates, exercise names, set types, weights, reps and RPE. It is not a lossless backup: distance, timed cardio, notes, and source-specific metadata are not represented by these maps. The app supports two workout slots per day, 30 exercises per workout and 30 sets per exercise. Review the counts and any skipped rows before committing.

Format references: [Hevy API](https://api.hevyapp.com/docs/), [Strong's CSV export documentation](https://help.strongapp.io/article/235-export-workout-data). The actual unit/column mappings and regression fixtures in this repository are the implementation contract.
