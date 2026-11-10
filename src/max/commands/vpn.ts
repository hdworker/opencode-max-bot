import type { MaxBot } from "../bot.js";
import { logger } from "../../utils/logger.js";
import {
  searchForVpnConfigs,
  VpnCheckerUnavailableError,
  VpnSearchAlreadyRunningError,
  VpnSearchTimeoutError,
  VPN_PROFILE_LABELS,
  type VpnProfile,
} from "../../vpn/service.js";

export function registerVpnCommand(bot: MaxBot): void {
  bot.command(
    "vpn",
    "Find VPN configs for ChatGPT and social apps",
    async (_userId, chatId, _text, args) => {
      const profiles = parseProfiles(args);
      if (!profiles) {
        await bot.sendMessage(chatId, {
          text: "Формат: /vpn — оба варианта; /vpn chatgpt или /vpn social — один вариант.",
        });
        return;
      }

      let statusMessage: Awaited<ReturnType<MaxBot["sendMessage"]>> | undefined;
      try {
        statusMessage = await bot.sendMessage(chatId, {
          text: "⏳ Скачиваю свежие пулы Goida VPN и проверяю варианты отдельными HTTPS-запросами к целевым сервисам. Это может занять несколько минут.",
        });
      } catch (error) {
        logger.warn("[VPN] Could not send search status:", error);
        return;
      }

      try {
        const results = await searchForVpnConfigs(profiles);
        const sections = profiles.map((profile) =>
          formatProfileResult(profile, results[profile] ?? null),
        );

        await replyWithStatus(bot, chatId, statusMessage.message_id, {
          text: `${sections.join("\n\n")}\n\nПроверка сделана с VPS по веб-эндпоинтам; доступность у вашего провайдера и в нативном Telegram может отличаться. Публичный прокси видит посещаемые домены — используйте HTTPS и не входите через него в чувствительные аккаунты.`,
        });
      } catch (error) {
        if (error instanceof VpnSearchAlreadyRunningError) {
          await replyWithStatus(bot, chatId, statusMessage.message_id, {
            text: "⏳ Поиск уже выполняется. Дождитесь его завершения.",
          });
          return;
        }
        if (error instanceof VpnCheckerUnavailableError) {
          await replyWithStatus(bot, chatId, statusMessage.message_id, {
            text: "❌ Проверяющий xray-knife не установлен. Запустите обновлённый deploy-скрипт бота.",
          });
          return;
        }
        if (error instanceof VpnSearchTimeoutError) {
          await replyWithStatus(bot, chatId, statusMessage.message_id, {
            text: "❌ Проверка заняла больше 15 минут и была остановлена. Попробуйте позже.",
          });
          return;
        }

        logger.error("[VPN] Search failed:", error);
        await replyWithStatus(bot, chatId, statusMessage.message_id, {
          text: "❌ Не удалось загрузить список или проверить конфиги. Попробуйте позже.",
        });
      }
    },
  );
}

function parseProfiles(args: string): VpnProfile[] | null {
  const value = args.trim().toLowerCase();
  if (!value) return ["chatgpt", "social"];
  if (value === "chatgpt" || value === "ai") return ["chatgpt"];
  if (value === "social" || value === "media" || value === "tg") return ["social"];
  return null;
}

function formatProfileResult(profile: VpnProfile, vpnConfig: string | null): string {
  if (!vpnConfig) {
    return `❌ **${VPN_PROFILE_LABELS[profile]}** — не нашёл конфиг, прошедший все проверки профиля.`;
  }
  return `✅ **${VPN_PROFILE_LABELS[profile]}**\n\n\`\`\`\n${vpnConfig}\n\`\`\``;
}

async function replyWithStatus(
  bot: MaxBot,
  chatId: number,
  messageId: string,
  body: Parameters<MaxBot["sendMessage"]>[1],
): Promise<void> {
  const formattedBody = { ...body, format: body.format ?? "markdown" };
  try {
    await bot.editMessage(messageId, formattedBody);
  } catch (error) {
    logger.warn("[VPN] Could not update search status:", error);
    await bot.sendMessage(chatId, formattedBody);
  }
}
