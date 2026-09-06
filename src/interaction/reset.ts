import { interactionManager } from "./manager.js";
import { permissionManager } from "../permission/manager.js";
import { questionManager } from "../question/manager.js";

export function clearChatWorkflowState(chatId: number): void {
  interactionManager.clear(chatId);
  questionManager.clear(chatId);
  permissionManager.clearForChat(chatId);
}
