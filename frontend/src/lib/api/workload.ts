import api from '@/lib/api';

// ─── Status enum ──────────────────────────────────────────────────────────────

export type WorkloadStatus = 'NO_LOAD' | 'ON_TIME' | 'AHEAD' | 'BEHIND' | 'DELAYED';

// Frontend display labels for each enum value
export const STATUS_LABELS: Record<WorkloadStatus, string> = {
  NO_LOAD: 'No Load',
  ON_TIME: 'On Time',
  AHEAD:   'Ahead',
  BEHIND:  'Behind',
  DELAYED: 'Delayed',
};

// ─── Summary types ────────────────────────────────────────────────────────────

export interface WorkloadSummaryStats {
  memberCount: number;
  /** @deprecated use averageLoadedOccupancy (kept for backward compat) */
  averageOccupancy: number;
  /** Average occupancy across members who have at least one task (loaded members only) */
  averageLoadedOccupancy: number;
  /** Average occupancy across ALL members including idle ones — lower, whole-team view */
  averageOccupancyAllMembers: number;
  overloadedMembers: number;
  delayedMembers: number;
}

export interface WorkloadMemberSummary {
  id: string;
  name: string;
  role: string;
  avatar: { initials: string };
  capacityMinutes: number;
  totalTasks: number;
  completedCount: number;
  incompleteCount: number;
  assignedToday: number;
  completed: {
    allocatedMinutes: number;
    actualMinutes: number;
  };
  remainingMinutes: number;
  occupancyPct: number | null;
  isOverloaded: boolean;
  status: WorkloadStatus;
}

/** Flat top-level response from GET /performance/workload-summary */
export interface WorkloadSummaryResponse {
  date: string;
  dailyCapacity: number;
  isNonWorkingDay: boolean;
  remainingCapacityFromNow: number;
  summary: WorkloadSummaryStats;
  members: WorkloadMemberSummary[];
}

// ─── Detail types ─────────────────────────────────────────────────────────────

export interface WorkloadTask {
  id: string;
  title: string;
  status: string;
  estimated_minutes: number;
  total_working_minutes: number;
  due_date: string | null;
  /** When the task was assigned to this member */
  assigned_at: string | null;
  /** When the member submitted the task */
  submitted_at: string | null;
  /** When the task was approved */
  approved_at: string | null;
  is_manual: boolean;
  instance_id: string | null;
  instance_name: string | null;
  client_name: string | null;
}

export interface WorkloadCompletionRecord {
  id: string;
  title: string;
  /** Task status — COMPLETED or APPROVED for history records */
  status?: string;
  instance_name: string | null;
  client_name: string | null;
  allocated_minutes: number;
  actual_minutes: number;
}

/** Flat top-level response from GET /performance/workload-member/:userId */
export interface WorkloadMemberDetail {
  member: {
    id: string;
    name: string;
    role: string;
    avatar: { initials: string };
  };
  date: string;
  dailyCapacity: number;
  isNonWorkingDay: boolean;
  remainingCapacityFromNow: number;
  capacityMinutes: number;
  assignedToday: number;
  completed: {
    allocatedMinutes: number;
    actualMinutes: number;
  };
  remainingMinutes: number;
  occupancyPct: number | null;
  isOverloaded: boolean;
  status: WorkloadStatus;
  taskList: WorkloadTask[];
  completionHistory: WorkloadCompletionRecord[];
}

// ─── API functions ────────────────────────────────────────────────────────────

export async function fetchWorkloadSummary(date?: string): Promise<WorkloadSummaryResponse> {
  const params: Record<string, string> = {};
  if (date) params.date = date;
  const res = await api.get('/performance/workload-summary', { params });
  // Flat response — no .data wrapper
  return res.data as WorkloadSummaryResponse;
}

export async function fetchWorkloadMemberDetail(
  userId: string,
  date?: string
): Promise<WorkloadMemberDetail> {
  const params: Record<string, string> = {};
  if (date) params.date = date;
  const res = await api.get(`/performance/workload-member/${userId}`, { params });
  // Flat response — no .data wrapper
  return res.data as WorkloadMemberDetail;
}
