import { log } from "../utils/log";
import { discordPlugin } from "./discord";
import { genericWebhookPlugin } from "./generic-webhook";
import { initializeEventSubscriptions, registerPlugin } from "./registry";
import { slackPlugin } from "./slack";
import { telegramPlugin } from "./telegram";

export function initializePlugins() {
  log.info("Initializing plugins...");

  registerPlugin(slackPlugin);
  registerPlugin(discordPlugin);
  registerPlugin(genericWebhookPlugin);
  registerPlugin(telegramPlugin);
  initializeEventSubscriptions();

  log.info("✅ Plugins initialized");
}

export * from "./registry";
export * from "./types";
