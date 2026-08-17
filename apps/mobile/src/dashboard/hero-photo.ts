/**
 * The photograph behind the Today hero.
 *
 * These are hotlinked from Unsplash's CDN, which means two things worth being
 * honest about: the images are someone else's, and the first load of each one
 * needs the network. `hero-photo-cache` handles the second problem by putting
 * every photo in Cache Storage on first run; swap the ids below for
 * photographs you have actually licensed before this ships anywhere that
 * matters.
 *
 * The groupings below are kept because they describe the set — and because a
 * time-of-day rotation is a small change away — but selection is currently a
 * straight shuffle across all of them.
 */

const UNSPLASH_PARAMS = "auto=format&fit=crop&w=1400&q=70"

function unsplash(id: string) {
  return `https://images.unsplash.com/${id}?${UNSPLASH_PARAMS}`
}

/** Daylight, open air, the day not yet spent. */
const MORNING = [
  "photo-1490645935967-10de6ba17061",
  "photo-1476480862126-209bfaa8edc8",
  "photo-1483721310020-03333e577078",
  "photo-1502904550040-7534597429ae",
] as const

/** The training half of the day. */
const DAY = [
  "photo-1571019613454-1cb2f99b2d8b",
  "photo-1517963879433-6ad2b056d712",
  "photo-1594737625785-a6cbdabd333c",
  "photo-1544367567-0f2fcb009e0b",
] as const

/** Low light, wind-down, the day being counted up. */
const EVENING = [
  "photo-1517836357463-d25dfeac3438",
  "photo-1552674605-db6ffd4facb5",
  "photo-1517649763962-0c623066013b",
  "photo-1538805060514-97d9cc17730c",
  "photo-1540497077202-7c8a3999166f",
] as const

/** Every photo in the rotation, which is also the prefetch list. */
export const HERO_PHOTOS: string[] = [
  ...new Set([...MORNING, ...DAY, ...EVENING]),
].map(unsplash)

/**
 * A photo at random, never the one already showing.
 *
 * The exclusion is the whole point: without it a shuffle lands on the current
 * photo one time in thirteen, and a crossfade from an image to itself looks
 * like a rendering bug rather than a choice.
 */
export function randomHeroPhoto(exclude?: string): string {
  const options = HERO_PHOTOS.filter((photo) => photo !== exclude)
  const pool = options.length > 0 ? options : HERO_PHOTOS
  return pool[Math.floor(Math.random() * pool.length)]
}
