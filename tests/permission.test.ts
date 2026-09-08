import { afterEach, describe, expect, it } from "vitest";
import { permissionManager, type PermissionRequest } from "../src/permission/manager.js";

afterEach(() => permissionManager.clear());

function request(id: string, overrides: Partial<PermissionRequest> = {}): PermissionRequest {
  return {
    id,
    chatId: 10,
    sessionId: "session-1",
    message: "external_directory",
    patterns: ["/etc/systemd/system/*"],
    ...overrides,
  };
}

describe("permission manager", () => {
  it("groups duplicate checks for the same session and pattern", () => {
    const first = request("permission-1");
    permissionManager.add(first);
    permissionManager.add(request("permission-2"));
    permissionManager.add(request("permission-other-chat", { chatId: 20 }));
    permissionManager.add(request("permission-other-pattern", { patterns: ["/etc/*"] }));

    expect(permissionManager.getRelated(first).map((item) => item.id)).toEqual([
      "permission-1",
      "permission-2",
    ]);
  });
});
