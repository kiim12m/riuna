import { log } from "../utils/log";
import { discordPlugin } from "./discord";
import { genericWebhookPlugin } from "./generic-webhook";
import { giteaPlugin } from "./gitea";
import { githubPlugin, initializeGitHubPlugin } from "./github";
import { initializeEventSubscriptions, registerPlugin } from "./registry";
import { slackPlugin } from "./slack";
import { telegramPlugin } from "./telegram";

export function initializePlugins() {
  log.info("Initializing plugins...");

  registerPlugin(githubPlugin);
  registerPlugin(giteaPlugin);
  registerPlugin(slackPlugin);
  registerPlugin(discordPlugin);
  registerPlugin(genericWebhookPlugin);
  registerPlugin(telegramPlugin);
  initializeGitHubPlugin();
  initializeEventSubscriptions();

  log.info("✅ Plugins initialized");
}

export * from "./registry";
export * from "./types";
