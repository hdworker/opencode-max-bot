import {
  VPN_PROFILE_LABELS,
  type VpnDiagnostics,
  type VpnProfile,
  type VpnProfileDiagnostic,
} from "./service.js";

export function formatVpnProfileStatistics(
  stats: VpnProfileDiagnostic | undefined,
  poolCount: number,
): string {
  if (!stats) return "Проверка не запускалась.";

  const parts = [
    "Проверено " + stats.testedCount + "/" + stats.candidateCount + " конфигов",
    "прошло " + stats.passedCount,
  ];
  if (stats.skippedPreviouslyIssued > 0) {
    parts.push("ранее выданных пропущено " + stats.skippedPreviouslyIssued);
  }
  if (stats.semiPassedCount > 0) parts.push("частично прошло " + stats.semiPassedCount);
  if (stats.failedCount > 0) parts.push("не прошло " + stats.failedCount);
  if (stats.maxPassed === 0) parts.push("полный прогон");
  if (stats.status === "timed_out") parts.push("таймаут");
  if (stats.error) parts.push("ошибка " + stats.error);
  if (stats.unparsedResultCount > 0) {
    parts.push("неразобранных строк Xray " + stats.unparsedResultCount);
  }

  const endpoints = formatEndpointStatistics(stats);
  const failures = formatFailureKinds(stats);
  const outcome = [parts.join("; "), "из пула " + poolCount].join("; ");
  return [
    outcome + ".",
    endpoints ? "Проверки: " + endpoints + "." : "",
    failures ? "Причины отказов: " + failures + "." : "",
    stats.firstPassed
      ? "Первый прошедший ID " + stats.firstPassed.id +
        (stats.firstPassed.exitIp ? ", exit IP " + stats.firstPassed.exitIp : "") +
        (stats.firstPassed.country ? ", " + stats.firstPassed.country : "") +
        ", endpoint'ы " + stats.firstPassed.succeededEndpoints + "/" +
        stats.firstPassed.totalEndpoints + "."
      : "",
  ].filter(Boolean).join("\n");
}

export function formatVpnPoolSummary(report: VpnDiagnostics, detailed: boolean): string {
  const downloaded = report.sources.filter((source) => source.status === "downloaded").length;
  const fetchedTimes = report.sources
    .map((source) => source.downloadedAt)
    .filter((value): value is string => Boolean(value))
    .sort();
  const newestFileUpdate = report.sources
    .filter((source) => source.fileUpdatedAt)
    .sort((left, right) =>
      Date.parse(right.fileUpdatedAt ?? "") - Date.parse(left.fileUpdatedAt ?? ""),
    )[0];

  const lines = [
    "Пулы: скачано " + downloaded + "/" + report.sources.length +
      "; ссылок " + report.rawConfigLinkCount +
      "; в Xray Knife передано " + report.candidateCount + "/" + report.candidateLimit +
      (report.poolMayBeTruncated ? " (достигнут лимит пула)" : "") + ".",
  ];

  if (fetchedTimes.length > 0) {
    lines.push(
      "Последняя загрузка файла: " + formatMsk(fetchedTimes[fetchedTimes.length - 1]!) + ".",
    );
  }
  if (newestFileUpdate?.fileUpdatedAt) {
    lines.push(
      "Самое свежее обновление источника: " +
        newestFileUpdate.name + " — " + formatMsk(newestFileUpdate.fileUpdatedAt) +
        " (" + formatAge(Date.now() - Date.parse(newestFileUpdate.fileUpdatedAt)) + ").",
    );
  } else if (report.sourceMetadataError) {
    lines.push("Время обновления файлов из README не получено: " + report.sourceMetadataError + ".");
  } else {
    lines.push("README не сообщил время обновления файлов.");
  }

  if (detailed) {
    lines.push("");
    lines.push("Файлы источников:");
    for (const source of report.sources) {
      if (source.status === "failed") {
        lines.push(
          "• " + source.name + ": ошибка " + (source.error ?? "download-error") + ".",
        );
        continue;
      }
      const updated =
        source.fileUpdatedAt
          ? formatMsk(source.fileUpdatedAt) + " (" +
            formatAge(Date.now() - Date.parse(source.fileUpdatedAt)) + ", " +
            getFreshnessLabel(Date.now() - Date.parse(source.fileUpdatedAt)) + ")"
          : "время обновления неизвестно";
      const fetched = source.downloadedAt ? formatMsk(source.downloadedAt) : "время загрузки неизвестно";
      lines.push(
        "• " + source.name + ": загружен " + fetched +
          "; в источнике обновлён " + updated +
          "; ссылок " + (source.configLinks ?? 0) +
          "; поставлено в очередь " + (source.queuedConfigs ?? 0) + ".",
      );
    }

    if (report.sourceMetadataError) {
      lines.push("README-метаданные: " + report.sourceMetadataError + ".");
    }
  }

  return lines.join("\n");
}

export function formatVpnDiagnostics(report: VpnDiagnostics, detailed: boolean): string {
  const state =
    report.status === "running"
      ? "выполняется"
      : report.status === "completed"
        ? "завершена"
        : "завершилась с ошибкой";
  const lines = [
    "🔎 **VPN — диагностика**",
    "Состояние: " + state +
      (report.activeProfile ? "; профиль " + VPN_PROFILE_LABELS[report.activeProfile] : "") + ".",
    "Запуск: " + formatMsk(report.startedAt) +
      (report.finishedAt ? "; завершение: " + formatMsk(report.finishedAt) : "") + ".",
    formatVpnPoolSummary(report, detailed),
  ];

  for (const profile of ["chatgpt", "social"] as VpnProfile[]) {
    const stats = report.profiles[profile];
    if (!stats) continue;
    lines.push("");
    lines.push("**" + VPN_PROFILE_LABELS[profile] + "**");
    lines.push(formatVpnProfileStatistics(stats, report.candidateCount));
    if (stats.status === "running") {
      lines.push("Сейчас проверено " + stats.testedCount + " из " + stats.candidateCount + ".");
    }
  }

  const recentIssued = report.lastIssued.slice(-3).reverse();
  if (recentIssued.length > 0) {
    lines.push("");
    lines.push("Последние выданные конфиги:");
    for (const item of recentIssued) {
      lines.push(
        "• " + VPN_PROFILE_LABELS[item.profile] + " ID " + item.id +
          "; " + formatMsk(item.issuedAt) +
          (item.exitIp ? "; exit IP " + item.exitIp : "") +
          "; endpoint'ы " + item.succeededEndpoints + "/" + item.totalEndpoints + ".",
      );
    }
  }

  if (report.error) {
    lines.push("");
    lines.push("Ошибка запуска: " + report.error + ".");
  }
  return lines.join("\n\n");
}

function formatEndpointStatistics(stats: VpnProfileDiagnostic): string {
  return Object.entries(stats.endpoints)
    .map(([name, count]) =>
      name + " " + count.succeeded + "/" + count.total +
      (count.timedOut > 0 ? " (timeout " + count.timedOut + ")" : ""),
    )
    .join(", ");
}

function formatFailureKinds(stats: VpnProfileDiagnostic): string {
  return Object.entries(stats.failureKinds)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([kind, count]) => kind + " " + count)
    .join(", ");
}

function formatMsk(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "неизвестно";
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date) + " МСК";
}

function formatAge(ageMs: number): string {
  const minutes = Math.max(0, Math.floor(ageMs / 60_000));
  if (minutes < 60) return minutes + " мин назад";
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) return hours + " ч " + remainingMinutes + " мин назад";
  const days = Math.floor(hours / 24);
  return days + " д " + (hours % 24) + " ч назад";
}

function getFreshnessLabel(ageMs: number): string {
  if (ageMs <= 30 * 60_000) return "актуален";
  if (ageMs <= 2 * 60 * 60_000) return "есть задержка";
  return "устарел";
}
