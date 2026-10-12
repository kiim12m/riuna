import { useQuery } from "@tanstack/react-query";
import { getMySessions } from "@/fetchers/session";

export const MY_SESSIONS_KEY = ["my-sessions"] as const;

export function useMySessions() {
  return useQuery({ queryKey: MY_SESSIONS_KEY, queryFn: getMySessions });
}
