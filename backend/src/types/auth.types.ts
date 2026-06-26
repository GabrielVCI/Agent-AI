export type UserRoleType =
  | "SUPER_ADMIN"
  | "OWNER"
  | "ADMIN"
  | "AGENT_OPERATOR"
  | "BILLING";

export type UserStatusType = "ACTIVE" | "INVITED" | "DISABLED";

export interface AuthenticatedUser {
  id: string;
  tenantId: string | null;
  email: string;
  name: string;
  role: UserRoleType;
  status: UserStatusType;
}

export interface SessionCachePayload {
  userId: string;
  tenantId: string | null;
  email: string;
  name: string;
  role: UserRoleType;
  status: UserStatusType;
}
