import type { User as BetterAuthUser } from "better-auth/types";

export type User = BetterAuthUser & {
  locale?: string | null;
  // Los anaden los plugins admin y username del servidor; el tipo base de
  // better-auth no los conoce.
  role?: string | null;
  username?: string | null;
  isLocalAccount?: boolean | null;
};
