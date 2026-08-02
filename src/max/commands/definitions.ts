export interface BotCommandDefinition {
  command: string;
  descriptionKey: string;
}

export const COMMAND_DEFINITIONS: BotCommandDefinition[] = [
  { command: "start", descriptionKey: "cmd.description.start" },
  { command: "help", descriptionKey: "cmd.description.help" },
  { command: "status", descriptionKey: "cmd.description.status" },
  { command: "new", descriptionKey: "cmd.description.new" },
  { command: "abort", descriptionKey: "cmd.description.abort" },
  { command: "sessions", descriptionKey: "cmd.description.sessions" },
  { command: "projects", descriptionKey: "cmd.description.projects" },
  { command: "rename", descriptionKey: "cmd.description.rename" },
  { command: "opencode_start", descriptionKey: "cmd.description.opencode_start" },
  { command: "opencode_stop", descriptionKey: "cmd.description.opencode_stop" },
  { command: "detach", descriptionKey: "cmd.description.detach" },
  { command: "worktree", descriptionKey: "cmd.description.worktree" },
  { command: "open", descriptionKey: "cmd.description.open" },
  { command: "ls", descriptionKey: "cmd.description.ls" },
  { command: "tts", descriptionKey: "cmd.description.tts" },
  { command: "task", descriptionKey: "cmd.description.task" },
  { command: "tasklist", descriptionKey: "cmd.description.tasklist" },
  { command: "commands", descriptionKey: "cmd.description.commands" },
  { command: "skills", descriptionKey: "cmd.description.skills" },
  { command: "mcps", descriptionKey: "cmd.description.mcps" },
  { command: "models", descriptionKey: "cmd.description.models" },
];
