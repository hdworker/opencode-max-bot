import { startBotApp } from "./app/start-bot-app.js";

startBotApp().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
