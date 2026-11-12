import type { MaxBot } from "../bot.js";
import { logger } from "../../utils/logger.js";
import {
  getVpnDiagnostics,
  searchForVpnConfigs,
  VpnSearchAlreadyRunningError,
  VPN_PROFILE_LABELS,
  type VpnProfile,
  type VpnProfileDiagnostic,
} from "../../vpn/service.js";
import {
  formatVpnDiagnostics,
  formatVpnPoolSummary,
  formatVpnProfileStatistics,
} from "../../vpn/format.js";

export function registerVpnCommand(bot: MaxBot): void {
  bot.command(
    "vpn",
    "Find VPN configs for ChatGPT and social apps",
    async (_userId, chatId, _text, args) => {
      const commandArgs = args.trim().toLowerCase();
      if (commandArgs === "stats") {
        const report = await getVpnDiagnostics();
        await bot.sendMessage(chatId, {
          text: report
            ? formatVpnDiagnostics(report, true)
            : "Пока нет сохранённой диагностики VPN. Выполните /vpn chatgpt или /vpn social; последующие запуски появятся в /vpn stats.",
          format: "markdown",
        });
        return;
      }

      const profiles = parseProfiles(commandArgs);
      if (!profiles) {
        await bot.sendMessage(chatId, {
          text: "Формат: /vpn — оба варианта; /vpn chatgpt или /vpn social — один вариант.",
        });
        return;
      }

      let statusMessage: Awaited<ReturnType<MaxBot["sendMessage"]>> | undefined;
      try {
        statusMessage = await bot.sendMessage(chatId, {
          text: "⏳ Скачиваю свежие пулы Goida VPN и проверяю каждый профиль отдельными HTTPS-запросами. Это может занять несколько минут.",
        });
      } catch {
        logger.warn("[VPN] Could not send search status.", { error: "message-send-failed" });
        return;
      }

      try {
        const result = await searchForVpnConfigs(profiles);
        const sections = profiles.map((profile) =>
          formatProfileResult(
            profile,
            result.configs[profile] ?? null,
            result.diagnostics.profiles[profile],
            result.diagnostics.candidateCount,
          ),
        );
        const diagnostic = result.diagnostics.error
          ? "\n\nДиагностика: " + result.diagnostics.error + "."
          : "";
        const text =
          sections.join("\n\n") +
          "\n\n" +
          formatVpnPoolSummary(result.diagnostics, false) +
          diagnostic +
          "\n\nПроверка сделана с VPS по веб-эндпоинтам; доступность у вашего провайдера и в нативном Telegram может отличаться. Публичный прокси видит посещаемые домены — используйте HTTPS и не входите через него в чувствительные аккаунты.";
        await replyWithStatus(bot, chatId, statusMessage.message_id, { text });
      } catch (error) {
        if (error instanceof VpnSearchAlreadyRunningError) {
          const report = await getVpnDiagnostics();
          await replyWithStatus(bot, chatId, statusMessage.message_id, {
            text: report
              ? "⏳ Поиск уже выполняется.\n\n" +
                report.phase + "; ссылок " + report.rawConfigLinkCount +
                "; в очереди " + report.candidateCount +
                (report.activeProfile
                  ? "; " + VPN_PROFILE_LABELS[report.activeProfile] + " проверено " +
                    (report.profiles[report.activeProfile]?.testedCount ?? 0)
                  : "") + "."
              : "⏳ Поиск уже выполняется. Дождитесь его завершения.",
          });
          return;
        }

        logger.error("[VPN] Search command failed.", { error: "unexpected-command-error" });
        const report = await getVpnDiagnostics();
        const reportText = report
          ? "\n\n" + formatVpnPoolSummary(report, false)
          : "";
        await replyWithStatus(bot, chatId, statusMessage.message_id, {
          text: "❌ Не удалось выполнить поиск VPN-конфигов." + reportText,
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

function formatProfileResult(
  profile: VpnProfile,
  vpnConfig: string | null,
  stats: VpnProfileDiagnostic | undefined,
  candidateCount: number,
): string {
  const title = VPN_PROFILE_LABELS[profile];
  const statsText = formatVpnProfileStatistics(stats, candidateCount);
  if (!vpnConfig) {
    return "❌ **" + title + "** — не нашёл конфиг, прошедший проверки профиля.\n" + statsText;
  }

  const id = stats?.firstPassed?.id;
  const idLine = id ? "ID " + id + " — " : "";
  const fence = String.fromCharCode(96).repeat(3);
  return (
    "✅ **" + title + "**\n" +
    idLine + statsText +
    "\n\n" + fence + "\n" + vpnConfig + "\n" + fence
  );
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
  } catch {
    logger.warn("[VPN] Could not update search status.", { error: "message-edit-failed" });
    await bot.sendMessage(chatId, formattedBody);
  }
}
