import type { MaxBot } from "../bot.js";
import { logger } from "../../utils/logger.js";
import {
  getVpnDiagnostics,
  getVpnIssuedConfigs,
  recoverLegacyIssuedConfigs,
  rescanIssuedVpnConfigs,
  searchForVpnConfigs,
  VpnSearchAlreadyRunningError,
  VPN_PROFILE_LABELS,
  type VpnProfile,
  type VpnProfileDiagnostic,
} from "../../vpn/service.js";
import { MAX_MESSAGE_TEXT_LENGTH } from "../client.js";
import {
  formatVpnDiagnostics,
  formatVpnPoolSummary,
  formatVpnProfileStatistics,
} from "../../vpn/format.js";

export function registerVpnCommand(bot: MaxBot): void {
  bot.command(
    "vpn",
    "VPN: профили, статистика, выданные конфиги и повторная проверка",
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

      const managementCommand = /^(goods|rescan)(?:\s+(.+))?$/.exec(commandArgs);
      if (managementCommand) {
        const subcommand = managementCommand[1]!;
        const profiles = parseOptionalProfiles(managementCommand[2] ?? "");
        if (!profiles) {
          await bot.sendMessage(chatId, {
            text:
              "Формат: /vpn " +
              subcommand +
              " — оба профиля; /vpn " +
              subcommand +
              " chatgpt или /vpn " +
              subcommand +
              " social — один профиль.",
          });
          return;
        }
        if (subcommand === "goods") {
          await sendIssuedConfigs(bot, chatId, profiles);
        } else {
          await rescanStoredConfigs(bot, chatId, profiles);
        }
        return;
      }

      const profiles = parseProfiles(commandArgs);
      if (!profiles) {
        await bot.sendMessage(chatId, {
          text:
            "Формат: /vpn — оба варианта; /vpn chatgpt или /vpn social — один вариант; " +
            "/vpn stats — диагностика; /vpn goods [chatgpt|social] — список выданных; " +
            "/vpn rescan [chatgpt|social] — перепроверить список.",
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
                report.phase +
                "; ссылок " +
                report.rawConfigLinkCount +
                "; в очереди " +
                report.candidateCount +
                (report.activeProfile
                  ? "; " +
                    VPN_PROFILE_LABELS[report.activeProfile] +
                    " проверено " +
                    (report.profiles[report.activeProfile]?.testedCount ?? 0)
                  : "") +
                "."
              : "⏳ Поиск уже выполняется. Дождитесь его завершения.",
          });
          return;
        }

        logger.error("[VPN] Search command failed.", { error: "unexpected-command-error" });
        const report = await getVpnDiagnostics();
        const reportText = report ? "\n\n" + formatVpnPoolSummary(report, false) : "";
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

function parseOptionalProfiles(args: string): VpnProfile[] | null {
  const value = args.trim().toLowerCase();
  if (!value) return ["chatgpt", "social"];
  if (value === "chatgpt" || value === "ai") return ["chatgpt"];
  if (value === "social" || value === "media" || value === "tg") return ["social"];
  return null;
}

async function sendIssuedConfigs(
  bot: MaxBot,
  chatId: number,
  profiles: VpnProfile[],
): Promise<void> {
  let records = await getVpnIssuedConfigs(profiles);
  const unavailable = records.filter((record) => record.state === "unavailable");
  if (unavailable.length > 0) {
    let statusMessage: Awaited<ReturnType<MaxBot["sendMessage"]>> | undefined;
    try {
      statusMessage = await bot.sendMessage(chatId, {
        text: "⏳ Восстанавливаю строки недавних выдач из текущих источников.",
      });
      await recoverLegacyIssuedConfigs();
      records = await getVpnIssuedConfigs(profiles);
    } catch (error) {
      logger.warn("[VPN] Could not recover legacy issued configs.", {
        error: error instanceof Error ? error.name : "recovery-error",
      });
    }
    const chunks = buildGoodsChunks(records, profiles);
    if (statusMessage) {
      await replyWithStatus(bot, chatId, statusMessage.message_id, {
        text: chunks[0] ?? "Список пуст.",
      });
      for (const chunk of chunks.slice(1))
        await bot.sendMessage(chatId, { text: chunk, format: "markdown" });
    } else {
      for (const chunk of chunks)
        await bot.sendMessage(chatId, { text: chunk, format: "markdown" });
    }
    return;
  }

  const chunks = buildGoodsChunks(records, profiles);
  if (chunks.length === 0) {
    await bot.sendMessage(chatId, { text: "📭 Пока нет выданных VPN-конфигов." });
    return;
  }
  for (const chunk of chunks) await bot.sendMessage(chatId, { text: chunk, format: "markdown" });
}

async function rescanStoredConfigs(
  bot: MaxBot,
  chatId: number,
  profiles: VpnProfile[],
): Promise<void> {
  let stored = await getVpnIssuedConfigs(profiles);
  let unavailableCount = stored.filter((record) => record.state === "unavailable").length;
  let statusMessage: Awaited<ReturnType<MaxBot["sendMessage"]>> | undefined;
  if (unavailableCount > 0) {
    try {
      statusMessage = await bot.sendMessage(chatId, {
        text: "⏳ Восстанавливаю строки недавних выдач перед повторной проверкой.",
      });
      await recoverLegacyIssuedConfigs();
      stored = await getVpnIssuedConfigs(profiles);
      unavailableCount = stored.filter((record) => record.state === "unavailable").length;
    } catch (error) {
      logger.warn("[VPN] Could not recover legacy configs before rescan.", {
        error: error instanceof Error ? error.name : "recovery-error",
      });
    }
  }
  const active = stored.filter((record) => record.state === "active" && record.config);
  if (active.length === 0) {
    const body = {
      text:
        unavailableCount > 0
          ? "⚠️ Не нашёл сохранённых строк для проверки. " +
            unavailableCount +
            " старых выдач не удалось восстановить из текущих источников."
          : "📭 Нет активных выданных конфигов для повторной проверки.",
    };
    if (statusMessage) {
      await replyWithStatus(bot, chatId, statusMessage.message_id, body);
    } else {
      await bot.sendMessage(chatId, body);
    }
    return;
  }

  if (!statusMessage) {
    try {
      statusMessage = await bot.sendMessage(chatId, {
        text: "⏳ Повторно проверяю " + active.length + " сохранённых конфигов через Xray Knife.",
      });
    } catch (error) {
      logger.warn("[VPN] Could not send rescan status.", {
        error: error instanceof Error ? error.name : "message-send-failed",
      });
      return;
    }
  }

  try {
    const result = await rescanIssuedVpnConfigs(profiles);
    const summary =
      result.profiles.length === 0
        ? "Проверка не запускалась: нет активных сохранённых конфигов."
        : result.profiles
            .map((item) => {
              const checked =
                item.diagnostics.status === "completed"
                  ? "проверено " + item.testedCount + "/" + item.requestedCount
                  : "сканер не завершил проверку" +
                    (item.diagnostics.error ? " (" + item.diagnostics.error + ")" : "");
              return (
                "**" +
                VPN_PROFILE_LABELS[item.profile] +
                "**: " +
                checked +
                "; успешно " +
                item.passedCount +
                "; удалено " +
                item.removedCount +
                "; без результата " +
                item.untestedCount +
                " (сохранены до следующей проверки)."
              );
            })
            .join("\n");
    const unavailable =
      unavailableCount > 0
        ? "\nСтарых выдач без восстановленной строки: " + unavailableCount + "."
        : "";
    await replyWithStatus(bot, chatId, statusMessage.message_id, {
      text: "🔁 **Повторная проверка завершена**\n\n" + summary + unavailable,
    });
  } catch (error) {
    const message =
      error instanceof VpnSearchAlreadyRunningError
        ? "⏳ Другой VPN-поиск уже выполняется."
        : "❌ Не удалось завершить повторную проверку.";
    logger.warn("[VPN] Rescan failed.", {
      error: error instanceof Error ? error.name : "rescan-error",
    });
    await replyWithStatus(bot, chatId, statusMessage.message_id, { text: message });
  }
}

function buildGoodsChunks(
  records: Awaited<ReturnType<typeof getVpnIssuedConfigs>>,
  profiles: VpnProfile[],
): string[] {
  const active = records.filter((record) => record.state === "active" && record.config);
  const unavailable = records.filter((record) => record.state === "unavailable");
  const title =
    "📦 Выданные конфиги: " +
    active.length +
    (unavailable.length > 0 ? "; не восстановлено " + unavailable.length : "") +
    "\nПрофили: " +
    profiles.map((profile) => VPN_PROFILE_LABELS[profile]).join(", ") +
    ".";
  const items = [
    ...active.map(
      (record) =>
        "**" +
        VPN_PROFILE_LABELS[record.profile] +
        " · ID " +
        record.id +
        " · " +
        formatIssuedAt(record.issuedAt) +
        "**\n```\n" +
        record.config +
        "\n```",
    ),
    ...unavailable.map(
      (record) =>
        "**" +
        VPN_PROFILE_LABELS[record.profile] +
        " · ID " +
        record.id +
        " · " +
        formatIssuedAt(record.issuedAt) +
        "**\nСтрока из старой выдачи не найдена в текущих источниках.",
    ),
  ];
  if (items.length === 0) return [];

  const targetLength = MAX_MESSAGE_TEXT_LENGTH - 100;
  const chunks: string[] = [];
  let current = title;
  for (const item of items) {
    if (current.length + item.length + 2 > targetLength && current !== title) {
      chunks.push(current);
      current = "📦 Продолжение списка выданных конфигов.";
    }
    if (current.length + item.length + 2 > targetLength) {
      logger.warn("[VPN] Stored config exceeds the safe MAX list message size.", {
        id: /ID ([a-f0-9]{12})/.exec(item)?.[1] ?? "unknown",
      });
      continue;
    }
    current += "\n\n" + item;
  }
  if (current !== title || chunks.length === 0) chunks.push(current);
  return chunks;
}

function formatIssuedAt(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "время неизвестно";
  return (
    new Intl.DateTimeFormat("ru-RU", {
      timeZone: "Europe/Moscow",
      dateStyle: "short",
      timeStyle: "short",
    }).format(date) + " МСК"
  );
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
    "✅ **" + title + "**\n" + idLine + statsText + "\n\n" + fence + "\n" + vpnConfig + "\n" + fence
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
