import { interactionManager } from "./manager.js";
import { permissionManager } from "../permission/manager.js";
import { questionManager } from "../question/manager.js";
import { promptOperationManager } from "../max/prompt-operation.js";

export function clearChatWorkflowState(chatId: number): void {
  promptOperationManager.cancel(chatId);
  interactionManager.clear(chatId);
  questionManager.clear(chatId);
  permissionManager.clearForChat(chatId);
}
