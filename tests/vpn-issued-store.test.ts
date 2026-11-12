import { describe, expect, it } from "vitest";
import {
  filterPreviouslyIssuedConfigs,
  pruneVpnIssuedRecords,
  vpnConfigId,
  vpnConfigIdentity,
  type VpnIssuedConfigRecord,
} from "../src/vpn/issued-store.js";

const config =
  "vless://11111111-2222-4333-8444-555555555555@vpn.example:443?security=reality&pbk=public-key&type=tcp#first-name";

function record(value: string, profile: "chatgpt" | "social" = "social"): VpnIssuedConfigRecord {
  return {
    id: vpnConfigId(value),
    identity: vpnConfigIdentity(value),
    profile,
    issuedAt: "2026-11-12T12:00:00.000Z",
    state: "active",
    config: value,
  };
}

describe("VPN issued config history", () => {
  it("suppresses an already-issued connection even when its remark and query order change", () => {
    const renamed =
      "vless://11111111-2222-4333-8444-555555555555@vpn.example:443?type=tcp&pbk=public-key&security=reality#second-name";
    const fresh =
      "vless://66666666-2222-4333-8444-555555555555@vpn.example:443?security=reality#fresh";

    const result = filterPreviouslyIssuedConfigs([renamed, fresh], [record(config)]);

    expect(result.configs).toEqual([fresh]);
    expect(result.skipped).toBe(1);
  });

  it("removes failed strings but retains their identity so future searches cannot issue them again", () => {
    const passed = record(config);
    const failedConfig =
      "vless://77777777-2222-4333-8444-555555555555@vpn.example:443?security=reality#failed";
    const failed = record(failedConfig);
    const untestedConfig =
      "vless://88888888-2222-4333-8444-555555555555@vpn.example:443?security=reality#untested";
    const untested = record(untestedConfig);

    const result = pruneVpnIssuedRecords(
      [passed, failed, untested],
      "social",
      [
        { identity: passed.identity, outcome: "passed" },
        { identity: failed.identity, outcome: "failed" },
      ],
      "2026-11-12T13:00:00.000Z",
    );

    expect(result.result).toEqual({ passed: 1, removed: 1, untested: 1 });
    expect(result.records[0]).toMatchObject({ state: "active", config, lastCheck: "passed" });
    expect(result.records[1]).toMatchObject({ state: "removed", lastCheck: "failed" });
    expect(result.records[1]?.config).toBeUndefined();
    expect(result.records[2]).toMatchObject({ state: "active", config: untestedConfig });
    expect(filterPreviouslyIssuedConfigs([failedConfig], result.records).skipped).toBe(1);
  });

  it("does not change records that belong to another profile", () => {
    const chatgpt = record(config, "chatgpt");
    const result = pruneVpnIssuedRecords(
      [chatgpt],
      "social",
      [{ identity: chatgpt.identity, outcome: "failed" }],
      "2026-11-12T13:00:00.000Z",
    );

    expect(result.changed).toBe(false);
    expect(result.result).toEqual({ passed: 0, removed: 0, untested: 0 });
    expect(result.records[0]).toMatchObject({ state: "active", config });
  });
});
