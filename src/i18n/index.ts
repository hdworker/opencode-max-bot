const dictionaries = {
  en: {
    "cmd.description.start": "Start the bot",
    "cmd.description.help": "Show available commands",
    "cmd.description.status": "Show current status",
    "cmd.description.new": "Create a new session",
    "cmd.description.abort": "Abort current session",
    "cmd.description.sessions": "List recent sessions",
    "cmd.description.projects": "List available projects",
    "cmd.description.rename": "Rename current session",
    "cmd.description.detach": "Detach from current session",
    "cmd.description.worktree": "Show git worktree info",
    "cmd.description.open": "Open file in editor",
    "cmd.description.ls": "List directory contents",
    "cmd.description.tts": "Toggle text-to-speech",
    "cmd.description.task": "Show task info",
    "cmd.description.tasklist": "Show task list",
    "cmd.description.commands": "List all commands",
    "cmd.description.skills": "List available skills",
    "cmd.description.mcps": "List MCP servers",
    "cmd.description.models": "List available models",
    "cmd.description.opencode_start": "Start OpenCode server",
    "cmd.description.opencode_stop": "Stop OpenCode server",
  },
  ru: {
    "cmd.description.start": "Запустить бота",
    "cmd.description.help": "Показать доступные команды",
    "cmd.description.status": "Показать текущий статус",
    "cmd.description.new": "Создать новую сессию",
    "cmd.description.abort": "Прервать текущую сессию",
    "cmd.description.sessions": "Список недавних сессий",
    "cmd.description.projects": "Список доступных проектов",
    "cmd.description.rename": "Переименовать текущую сессию",
    "cmd.description.detach": "Отключиться от сессии",
    "cmd.description.worktree": "Информация о git worktree",
    "cmd.description.open": "Открыть файл в редакторе",
    "cmd.description.ls": "Содержимое директории",
    "cmd.description.tts": "Вкл/выкл озвучку текста",
    "cmd.description.task": "Информация о задаче",
    "cmd.description.tasklist": "Список задач",
    "cmd.description.commands": "Все команды",
    "cmd.description.skills": "Доступные навыки",
    "cmd.description.mcps": "Серверы MCP",
    "cmd.description.models": "Доступные модели",
    "cmd.description.opencode_start": "Запустить OpenCode сервер",
    "cmd.description.opencode_stop": "Остановить OpenCode сервер",
  },
} as const;

type Locale = keyof typeof dictionaries;

let currentLocale: Locale = "en";

export function setLocale(locale: string): void {
  if (locale in dictionaries) {
    currentLocale = locale as Locale;
  }
}

export function t(key: string, vars?: Record<string, string>): string {
  const dict = dictionaries[currentLocale] ?? dictionaries.en;
  let text = (dict as Record<string, string>)[key] ?? key;

  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, "g"), v);
    }
  }

  return text;
}
