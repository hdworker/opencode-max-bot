import { describe, expect, it } from "vitest";
import {
  createOpencodeServeSpawnCommand,
  findWindowsListeningPidInNetstat,
  resolveLocalOpencodeTarget,
} from "../src/opencode/process.js";

describe("OpenCode process helpers", () => {
  it("accepts local URLs and extracts their port", () => {
    expect(resolveLocalOpencodeTarget("http://localhost:5000")).toEqual({
      host: "localhost",
      port: 5000,
    });
    expect(resolveLocalOpencodeTarget("https://example.test:5000")).toBeNull();
  });

  it("builds a platform-specific serve command", () => {
    const command = createOpencodeServeSpawnCommand({ host: "localhost", port: 4096 });

    if (process.platform === "win32") {
      expect(command.command).toBe("cmd.exe");
      expect(command.args).toEqual(["/c", "opencode", "serve", "--port", "4096"]);
    } else {
      expect(command.command).toBe("opencode");
      expect(command.args).toEqual(["serve", "--port", "4096"]);
    }
  });

  it("finds the listening Windows PID for an exact port", () => {
    const netstat =
      "  TCP    127.0.0.1:4096    0.0.0.0:0    LISTENING    1234\n" +
      "  TCP    127.0.0.1:40960   0.0.0.0:0    LISTENING    5678";

    expect(findWindowsListeningPidInNetstat(netstat, 4096)).toBe(1234);
    expect(findWindowsListeningPidInNetstat(netstat, 4097)).toBeNull();
  });
});
