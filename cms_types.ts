export type AuditType = {
  created_on: string;
  modified_on: string;
  created_by: number;
  modified_by: number;
};

export type RevisionType = AuditType & {
  rev_type: number;
  rev_object_id: number;
  rev_changed: string;
  rev_note: string;
  rev_diff: string;
};

// export type UserType = {
//   user_id: number;
// }

// export type UserAssignType = UserType & {
//   previous_owner: number;
// }

export type StatusType = {
  status: 0 | 1 | 2 | 3 | 4 | 5;
}

export type DateType = {
  published_on: string;
  unpublished_on: string | null;
  has_deadline: 1 | 0;
}

// export type HierarchyType = {
//   parent_id: number;
// }

// export type UUIDType = {
//   uuid: string;
// }
