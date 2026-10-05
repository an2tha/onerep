import { extraGuideCopy } from "./extra-copy"
import { tr } from "@repo/ui/i18n"

// Explicit translation keys for the shared, server-reviewed question bank.
export function guideCopy(): Record<string, string> {
  return {
    ...extraGuideCopy(),
    Chest: tr("Chest"),
    Lats: tr("Lats"),
    "Upper back": tr("Upper back"),
    Shoulders: tr("Shoulders"),
    Biceps: tr("Biceps"),
    Triceps: tr("Triceps"),
    Glutes: tr("Glutes"),
    Hamstrings: tr("Hamstrings"),
    Calves: tr("Calves"),
    Abs: tr("Abs"),
    Obliques: tr("Obliques"),
    "Lower body and core": tr("Lower body and core"),
    "What are we training for?": tr("What are we training for?"),
    "Give this session one clear purpose.": tr(
      "Give this session one clear purpose."
    ),
    "Build strength": tr("Build strength"),
    "Build muscle": tr("Build muscle"),
    "General fitness": tr("General fitness"),
    "What needs to change?": tr("What needs to change?"),
    "Start with your current workout. Keep what already works.": tr(
      "Start with your current workout. Keep what already works."
    ),
    "Make it shorter": tr("Make it shorter"),
    "Change equipment": tr("Change equipment"),
    "Refresh the exercises": tr("Refresh the exercises"),
    "Which muscles do you want to train?": tr(
      "Which muscles?"
    ),
    "This sets the balance of your session.": tr(
      "This sets the balance of your session."
    ),
    "Full body": tr("Full body"),
    "Upper body": tr("Upper body"),
    "Lower body": tr("Lower body"),
    "What can you train with?": tr("What can you train with?"),
    "Jev will work within the equipment you have.": tr(
      "Jev will work within the equipment you have."
    ),
    "Full gym": tr("Full gym"),
    "Dumbbells only": tr("Dumbbells only"),
    "Bodyweight only": tr("Bodyweight only"),
    "How much time do you have?": tr("How much time do you have?"),
    "Include time for warming up and resting between sets.": tr(
      "Include time for warming up and resting between sets."
    ),
    "20 minutes": tr("20 minutes"),
    "30 minutes": tr("30 minutes"),
    "45 minutes": tr("45 minutes"),
    "60 minutes": tr("60 minutes"),
    "How familiar is strength training?": tr(
      "How familiar is strength training?"
    ),
    "Choose what describes you today.": tr("Choose what describes you today."),
    "Just starting": tr("Just starting"),
    "Training regularly": tr("Training regularly"),
    "Very experienced": tr("Very experienced"),
    "Anything to work around?": tr("Anything to work around?"),
    "Exclude uncomfortable movements. You can add specifics before building.":
      tr(
        "Exclude uncomfortable movements. You can add specifics before building."
      ),
    "No restrictions": tr("No restrictions"),
    "Avoid jumping": tr("Avoid jumping"),
    "Avoid overhead work": tr("Avoid overhead work"),
    "I have specific restrictions": tr("I have specific restrictions"),
    "Which lift gets your best energy?": tr(
      "Which lift gets your best energy?"
    ),
    "Your priority movement goes near the start.": tr(
      "Your priority movement goes near the start."
    ),
    "Squat pattern": tr("Squat pattern"),
    Pressing: tr("Pressing"),
    Pulling: tr("Pulling"),
    "Keep it balanced": tr("Keep it balanced"),
    "What rhythm suits you?": tr("What rhythm suits you?"),
    "Rest is part of the workout, not an afterthought.": tr(
      "Rest is part of the workout, not an afterthought."
    ),
    "Unhurried sets": tr("Unhurried sets"),
    "Steady pace": tr("Steady pace"),
    "Shorter rests": tr("Shorter rests"),
    "How do you like to train?": tr("How do you like to train?"),
    "Build a session you will want to come back to.": tr(
      "Build a session you will want to come back to."
    ),
    "Familiar basics": tr("Familiar basics"),
    "A little variety": tr("A little variety"),
    "A mix of both": tr("A mix of both"),
    "How are you arriving today?": tr("How are you arriving today?"),
    "The session should fit the energy you actually have.": tr(
      "The session should fit the energy you actually have."
    ),
    "Ready to push": tr("Ready to push"),
    "Normal day": tr("Normal day"),
    "Keep it lighter": tr("Keep it lighter"),
    "What matters most for upper body?": tr(
      "What matters most for upper body?"
    ),
    "Give a little more room to your priority.": tr(
      "Give a little more room to your priority."
    ),
    "Chest and shoulders": tr("Chest and shoulders"),
    "Back and arms": tr("Back and arms"),
    "Balanced upper body": tr("Balanced upper body"),
    "What matters most for lower body?": tr(
      "What matters most for lower body?"
    ),
    "Keep the session balanced around your main focus.": tr(
      "Keep the session balanced around your main focus."
    ),
    Quads: tr("Quads"),
    "Glutes and hamstrings": tr("Glutes and hamstrings"),
    "Balanced lower body": tr("Balanced lower body"),
    "How would you like to finish?": tr("How would you like to finish?"),
    "Only add a finisher if it fits your time.": tr(
      "Only add a finisher if it fits your time."
    ),
    "Keep it strength only": tr("Keep it strength only"),
    "A little core work": tr("A little core work"),
    "Easy conditioning": tr("Easy conditioning"),
  }
}
