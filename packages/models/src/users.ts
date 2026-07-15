import type { ObjectId } from "mongodb";
export type UserRole = "admin" | "user";

export interface User {
  _id: ObjectId;
  email: string;
  name: string;
  role: UserRole;
  createdAt: Date;
}
