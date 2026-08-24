export function isCloud(): boolean {
  return process.env.RIUNA_CLOUD === "true";
}
