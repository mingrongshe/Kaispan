import { describe, expect, it } from "vitest";
import { PermissionDeniedError } from "../common/business-error";
import type { CurrentContext } from "../context/current-context";
import { AccessService } from "./access.service";
import { orgScope, unitScope } from "./scope";

const employee: CurrentContext = { userId: "u1", organizationId: "o1", unitId: "n1", role: "employee" };
const manager: CurrentContext = { userId: "u2", organizationId: "o1", unitId: "n1", role: "store_manager" };

describe("AccessService", () => {
  const access = new AccessService();

  it("员工和店长都能填表", () => {
    expect(access.canFillHaccp(employee)).toBe(true);
    expect(access.canFillHaccp(manager)).toBe(true);
  });

  it("只有店长能管理", () => {
    expect(access.canManageHaccp(employee)).toBe(false);
    expect(access.canManageHaccp(manager)).toBe(true);
  });

  it("员工调管理动作抛 PERMISSION_DENIED", () => {
    expect(() => access.assertCanManageHaccp(employee)).toThrow(PermissionDeniedError);
    expect(() => access.assertCanManageHaccp(manager)).not.toThrow();
  });
});

describe("租户范围", () => {
  it("unitScope 同时带 organizationId 和 unitId", () => {
    expect(unitScope(employee)).toEqual({ organizationId: "o1", unitId: "n1" });
  });

  it("orgScope 只带 organizationId", () => {
    expect(orgScope(employee)).toEqual({ organizationId: "o1" });
  });
});
