export interface BodyMeasurementRecord {
  userId: string
  id: string
  loggedAt: string
  weightKg?: number
  bodyFatPct?: number
  waistCm?: number
  hipsCm?: number
  chestCm?: number
  notes?: string
  createdAt: Date
  updatedAt: Date
}
