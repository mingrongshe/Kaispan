/**
 * KaiSpan 已有的门店范围权限，canFillHaccp() 沿用这个标识
 * （docs/kaispan-compatibility.md，来源 packages/db/src/rbac-catalog.ts）。
 */
export const HACCP_FILL_PERMISSION = "operations.haccp.fill" as const;

/**
 * 店长管理 HACCP 的正式 permission 还没决定。第一版由 canManageHaccp() 直接判断，
 * 故意不往 KaiSpan permission catalog 里发明新标识 —— 发明了将来对不上更难改。
 */
export const HACCP_MANAGE_PERMISSION = null;
