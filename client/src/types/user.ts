export type UserRole = "admin" | "user";

export type User = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: number;
};
