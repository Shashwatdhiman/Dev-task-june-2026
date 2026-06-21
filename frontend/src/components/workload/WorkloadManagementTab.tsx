'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import {
  CalendarDays, ChevronLeft, CheckCircle2, AlertCircle,
  TrendingUp, TrendingDown, Minus, Loader2, AlertTriangle,
  BarChart3, Zap, Timer, Users, Sun, Clock, Activity,
  ChevronDown,
} from 'lucide-react';
import {
  fetchWorkloadSummary,
  fetchWorkloadMemberDetail,
  STATUS_LABELS,
  type WorkloadSummaryResponse,
  type WorkloadMemberSummary,
  type WorkloadMemberDetail,
  type WorkloadStatus,
} from '@/lib/api/workload';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMinutes(mins: number): string {
  if (!mins || mins <= 0) return '0m';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function getDateForOffset(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().split('T')[0];
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

const DATE_QUICK = [
  { label: 'Yesterday', offset: -1 },
  { label: 'Today',     offset: 0  },
  { label: 'Tomorrow',  offset: 1  },
];

// ─── Occupancy color scale ────────────────────────────────────────────────────
// ≤80% green · 80-100% yellow · 100-130% orange · >130% red

function getOccupancyColor(pct: number): { bar: string; text: string; pill: string } {
  if (pct > 130) return { bar: 'bg-red-500',    text: 'text-red-600',    pill: 'bg-red-50 text-red-700 border-red-200' };
  if (pct > 100) return { bar: 'bg-orange-400', text: 'text-orange-600', pill: 'bg-orange-50 text-orange-700 border-orange-200' };
  if (pct > 80)  return { bar: 'bg-yellow-400', text: 'text-yellow-600', pill: 'bg-yellow-50 text-yellow-700 border-yellow-200' };
  return           { bar: 'bg-emerald-500', text: 'text-emerald-600', pill: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<WorkloadStatus, { bg: string; text: string; border: string; icon: string; light: string }> = {
  NO_LOAD: { bg: 'bg-slate-100',   text: 'text-slate-600',   border: 'border-slate-200', icon: '⚫', light: 'bg-slate-50' },
  ON_TIME: { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200', icon: '🟢', light: 'bg-emerald-50' },
  AHEAD:   { bg: 'bg-sky-100',     text: 'text-sky-700',     border: 'border-sky-200',     icon: '🔵', light: 'bg-sky-50' },
  BEHIND:  { bg: 'bg-orange-100',  text: 'text-orange-700',  border: 'border-orange-200',  icon: '🟠', light: 'bg-orange-50' },
  DELAYED: { bg: 'bg-red-100',     text: 'text-red-700',     border: 'border-red-200',     icon: '🔴', light: 'bg-red-50' },
};

const STATUS_REASON: Record<WorkloadStatus, string> = {
  NO_LOAD: 'No tasks assigned or capacity is 0 for this day.',
  ON_TIME: "Remaining work fits comfortably within today's capacity.",
  AHEAD:   "Remaining work is well within today's capacity (≤80% of time left).",
  BEHIND:  'Remaining work exceeds available hours left today.',
  DELAYED: 'Overdue task detected — one or more incomplete tasks are past their due time.',
};

function StatusBadge({ status, size = 'md' }: { status: WorkloadStatus; size?: 'sm' | 'md' | 'lg' }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.NO_LOAD;
  const cls = size === 'sm'
    ? 'px-2 py-0.5 text-[10px]'
    : size === 'lg'
    ? 'px-3 py-1 text-xs'
    : 'px-2.5 py-0.5 text-[11px]';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-semibold border ${cls} ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      <span className="text-[10px] leading-none">{cfg.icon}</span>
      {STATUS_LABELS[status]}
    </span>
  );
}

// ─── Task status badge ────────────────────────────────────────────────────────

const TASK_STATUS_MAP: Record<string, { label: string; cls: string }> = {
  COMPLETED:        { label: 'Completed',        cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  APPROVED:         { label: 'Approved',         cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  IN_PROGRESS:      { label: 'In Progress',      cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  PENDING_APPROVAL: { label: 'Pending Approval', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  REJECTED:         { label: 'Rejected',         cls: 'bg-red-50 text-red-700 border-red-200' },
  LOCKED:           { label: 'Upcoming',         cls: 'bg-slate-100 text-slate-600 border-slate-200' },
};

function TaskStatusBadge({ status }: { status: string }) {
  const s = TASK_STATUS_MAP[status] ?? { label: status, cls: 'bg-muted text-muted-foreground border-border' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${s.cls}`}>
      {s.label}
    </span>
  );
}

// ─── Occupancy bar ────────────────────────────────────────────────────────────

function OccupancyBar({ pct, capacityMinutes, assignedToday, compact = false }: {
  pct: number | null; capacityMinutes: number; assignedToday: number; compact?: boolean;
}) {
  if (pct === null) return <span className="text-xs text-muted-foreground">No capacity data</span>;
  const colors = getOccupancyColor(pct);
  const clamped = Math.min(pct, 150);
  return (
    <div className="w-full space-y-1">
      <div className={`${compact ? 'h-1.5' : 'h-2'} w-full rounded-full bg-muted/40 overflow-hidden relative`}>
        {pct > 100 && (
          <div className="absolute top-0 h-full w-px bg-red-400/70 z-10" style={{ left: `${(100 / 150) * 100}%` }} />
        )}
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${colors.bar}`}
          style={{ width: `${(clamped / 150) * 100}%` }}
        />
      </div>
      {!compact && (
        <div className="flex items-center justify-between text-[10px]">
          <span className={`font-semibold ${colors.text}`}>{pct}% Occupancy</span>
          <span className="text-muted-foreground font-mono">{formatMinutes(assignedToday)} / {formatMinutes(capacityMinutes)}</span>
        </div>
      )}
    </div>
  );
}

// ─── Member List Card (matches rejection-analytics-tab row style) ─────────────

function MemberCard({ member, onSelect }: { member: WorkloadMemberSummary; onSelect: (id: string) => void }) {
  const colors = getOccupancyColor(member.occupancyPct ?? 0);
  const cfg = STATUS_CONFIG[member.status] ?? STATUS_CONFIG.NO_LOAD;
  const initials = member.avatar.initials;

  return (
    <div
      onClick={() => onSelect(member.id)}
      className="rounded-2xl border border-border/30 bg-white p-5 cursor-pointer hover:border-foreground/20 hover:shadow-sm transition-all active:scale-[0.995]"
    >
      <div className="flex items-center justify-between gap-4">
        {/* Left: avatar + name + role */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold border border-primary/20 shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-foreground leading-tight">{member.name}</span>
              <StatusBadge status={member.status} size="sm" />
            </div>
            <p className="text-xs text-muted-foreground capitalize mt-0.5">{member.role}</p>
          </div>
        </div>

        {/* Right: occupancy + three stats */}
        <div className="flex items-center gap-6 shrink-0">
          {/* Occupancy pct pill */}
          <div className="text-center hidden sm:block">
            <div className={`text-lg font-bold tabular-nums ${colors.text}`}>
              {member.occupancyPct ?? 0}%
            </div>
            <p className="text-[10px] text-muted-foreground">Occupancy</p>
          </div>
          <div className="text-center hidden md:block">
            <div className="text-base font-bold text-foreground tabular-nums">{formatMinutes(member.assignedToday)}</div>
            <p className="text-[10px] text-muted-foreground">Assigned</p>
          </div>
          <div className="text-center hidden md:block">
            <div className="text-base font-bold text-emerald-600 tabular-nums">{formatMinutes(member.completed.allocatedMinutes)}</div>
            <p className="text-[10px] text-muted-foreground">Done</p>
          </div>
          <div className="text-center hidden md:block">
            <div className="text-base font-bold text-orange-600 tabular-nums">{formatMinutes(member.remainingMinutes)}</div>
            <p className="text-[10px] text-muted-foreground">Remaining</p>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground rotate-[-90deg] shrink-0" />
        </div>
      </div>

      {/* Occupancy bar */}
      <div className="mt-3">
        <OccupancyBar pct={member.occupancyPct} capacityMinutes={member.capacityMinutes} assignedToday={member.assignedToday} compact />
      </div>

      {/* Mobile stats row */}
      <div className="flex items-center gap-4 mt-3 sm:hidden text-xs text-muted-foreground">
        <span className={`font-bold ${colors.text}`}>{member.occupancyPct ?? 0}% occupied</span>
        <span>• {member.totalTasks} tasks</span>
        {member.completedCount > 0 && <span className="text-emerald-600">• {member.completedCount} done</span>}
      </div>
    </div>
  );
}

// ─── Detail View ──────────────────────────────────────────────────────────────

function MemberDetailView({ detail, onBack }: { detail: WorkloadMemberDetail; onBack: () => void }) {
  const DONE = ['COMPLETED', 'APPROVED'];
  const cfg = STATUS_CONFIG[detail.status] ?? STATUS_CONFIG.NO_LOAD;
  const colors = getOccupancyColor(detail.occupancyPct ?? 0);

  return (
    <div className="space-y-6">
      {/* Back button — same style as rejection-analytics-tab */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors rounded-lg border border-border/40 bg-white px-3 py-1.5 shadow-sm hover:shadow"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Team Overview
      </button>

      {/* ── Member header card ── */}
      <div className="rounded-2xl border border-border/30 bg-white shadow-sm p-6">
        {/* Name + status */}
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 rounded-full bg-primary/10 text-primary flex items-center justify-center text-lg font-bold border border-primary/20 shrink-0">
            {detail.member.avatar.initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl font-bold text-foreground" style={{ fontFamily: 'Manrope, sans-serif' }}>
                {detail.member.name}
              </h2>
              <StatusBadge status={detail.status} size="lg" />
            </div>
            <p className="text-sm text-muted-foreground capitalize mt-0.5">{detail.member.role}</p>
            {/* Status reason */}
            <p className="text-xs text-muted-foreground mt-1 italic">{STATUS_REASON[detail.status]}</p>
          </div>
        </div>

        {/* Occupancy bar */}
        <div className="mt-5">
          <OccupancyBar
            pct={detail.occupancyPct}
            capacityMinutes={detail.capacityMinutes}
            assignedToday={detail.assignedToday}
          />
        </div>

        {/* 4-stat row */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Capacity',  value: formatMinutes(detail.capacityMinutes),  cls: 'text-foreground' },
            { label: 'Assigned',  value: formatMinutes(detail.assignedToday),    cls: 'text-foreground' },
            { label: 'Remaining', value: formatMinutes(detail.remainingMinutes), cls: 'text-orange-600' },
            {
              label: 'Occupancy',
              value: detail.occupancyPct !== null ? `${detail.occupancyPct}%` : '—',
              cls: detail.isOverloaded ? 'text-red-600' : 'text-emerald-600',
            },
          ].map(({ label, value, cls }) => (
            <div key={label} className="rounded-xl bg-muted/20 p-3 text-center">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{label}</p>
              <p className={`text-lg font-bold tabular-nums mt-0.5 ${cls}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Totals strip */}
        <div className="mt-3 flex items-center divide-x divide-border/40 rounded-xl border border-border/30 overflow-hidden text-center bg-muted/10">
          <div className="flex-1 py-2">
            <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Assigned</p>
            <p className="text-sm font-bold text-foreground tabular-nums">{formatMinutes(detail.assignedToday)}</p>
          </div>
          <div className="flex-1 py-2">
            <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest">Completed</p>
            <p className="text-sm font-bold text-emerald-700 tabular-nums">{formatMinutes(detail.completed.allocatedMinutes)}</p>
          </div>
          <div className="flex-1 py-2">
            <p className="text-[9px] font-bold text-orange-600 uppercase tracking-widest">Remaining</p>
            <p className="text-sm font-bold text-orange-700 tabular-nums">{formatMinutes(detail.remainingMinutes)}</p>
          </div>
        </div>

        {detail.isNonWorkingDay && (
          <div className="mt-4 flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
            <Sun className="h-4 w-4 shrink-0" />
            Non-working day — capacity is 0 minutes
          </div>
        )}
      </div>

      {/* ── Task list ── */}
      <div className="rounded-2xl border border-border/30 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-6 py-4 border-b border-border/20">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-bold text-foreground" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Task List
          </h3>
          <span className="ml-auto text-xs text-muted-foreground">
            {detail.taskList.length} task{detail.taskList.length !== 1 ? 's' : ''}
          </span>
        </div>

        {detail.taskList.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="h-14 w-14 rounded-2xl bg-muted/30 flex items-center justify-center mx-auto mb-3">
              <BarChart3 className="h-7 w-7 opacity-20" />
            </div>
            <p className="font-semibold text-foreground">No tasks assigned</p>
            <p className="text-sm text-muted-foreground mt-1">No tasks are assigned for this day.</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/20 bg-muted/10">
                    <th className="text-left px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Task</th>
                    <th className="text-left px-4 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Type</th>
                    <th className="text-left px-4 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Status</th>
                    <th className="text-right px-4 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Estimated</th>
                    <th className="text-right px-4 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Actual</th>
                    <th className="text-right px-4 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hidden lg:table-cell">Assigned At</th>
                    <th className="text-right px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Due</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.taskList.map((t) => {
                    const isOverdue = t.due_date && new Date(t.due_date) < new Date() && !DONE.includes(t.status);
                    const isUpcoming = t.due_date && new Date(t.due_date) > new Date() && !DONE.includes(t.status);
                    return (
                      <tr
                        key={t.id}
                        className={`border-b border-border/10 last:border-b-0 transition-colors ${
                          isOverdue ? 'bg-red-50/60 hover:bg-red-50/80' : 'hover:bg-muted/10'
                        }`}
                      >
                        <td className="px-6 py-4">
                          <p className="font-semibold text-foreground leading-snug max-w-[200px] truncate">{t.title}</p>
                          {t.instance_name && <p className="text-[10px] text-primary font-medium mt-0.5">{t.instance_name}</p>}
                          {t.client_name && <p className="text-[10px] text-muted-foreground mt-0.5">{t.client_name}</p>}
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                            t.is_manual
                              ? 'bg-purple-50 text-purple-700 border-purple-200'
                              : 'bg-blue-50 text-blue-700 border-blue-200'
                          }`}>
                            {t.is_manual ? 'Manual' : 'Workflow'}
                          </span>
                        </td>
                        <td className="px-4 py-4"><TaskStatusBadge status={t.status} /></td>
                        <td className="px-4 py-4 text-right font-mono text-sm text-muted-foreground">
                          {formatMinutes(t.estimated_minutes)}
                        </td>
                        <td className="px-4 py-4 text-right font-mono text-sm">
                          {DONE.includes(t.status) ? (
                            t.total_working_minutes > 0
                              ? <span className="text-muted-foreground">{formatMinutes(t.total_working_minutes)}</span>
                              : <span className="text-muted-foreground/50">—</span>
                          ) : (
                            <span className="text-[11px] italic text-muted-foreground/60">Not completed</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-right font-mono text-xs text-muted-foreground hidden lg:table-cell">
                          {t.assigned_at
                            ? new Date(t.assigned_at).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })
                            : '—'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {t.due_date ? (
                            <span className={`text-xs font-semibold tabular-nums font-mono ${
                              isOverdue ? 'text-red-600' : isUpcoming ? 'text-emerald-600' : 'text-muted-foreground'
                            }`}>
                              {isOverdue && '🔴 '}
                              {isUpcoming && '🟢 '}
                              {new Date(t.due_date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          ) : <span className="text-muted-foreground/50 text-xs">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden divide-y divide-border/10">
              {detail.taskList.map((t) => {
                const isOverdue = t.due_date && new Date(t.due_date) < new Date() && !DONE.includes(t.status);
                const isUpcoming = t.due_date && new Date(t.due_date) > new Date() && !DONE.includes(t.status);
                return (
                  <div key={t.id} className={`p-4 ${isOverdue ? 'bg-red-50/60' : ''}`}>
                    <div className="flex items-start justify-between mb-2">
                      <p className="font-semibold text-foreground text-sm flex-1 min-w-0 pr-2 leading-snug">{t.title}</p>
                      <TaskStatusBadge status={t.status} />
                    </div>
                    {t.instance_name && <p className="text-xs text-primary font-medium mb-2">{t.instance_name}</p>}
                    <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                      <span>Est: <span className="font-mono text-foreground font-semibold">{formatMinutes(t.estimated_minutes)}</span></span>
                      {DONE.includes(t.status) ? (
                        t.total_working_minutes > 0
                          ? <span>Actual: <span className="font-mono font-semibold text-foreground">{formatMinutes(t.total_working_minutes)}</span></span>
                          : null
                      ) : (
                        <span className="italic text-muted-foreground/60">Not completed</span>
                      )}
                      {t.due_date && (
                        <span className={`ml-auto font-semibold font-mono ${isOverdue ? 'text-red-600' : isUpcoming ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                          {isOverdue ? '🔴 ' : isUpcoming ? '🟢 ' : ''}
                          {new Date(t.due_date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ── Completion history ── */}
      {detail.completionHistory.length > 0 && (
        <div className="rounded-2xl border border-border/30 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-6 py-4 border-b border-border/20">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <h3 className="text-sm font-bold text-foreground" style={{ fontFamily: 'Manrope, sans-serif' }}>
              Completion History
            </h3>
            <span className="ml-auto text-xs text-muted-foreground">{detail.completionHistory.length} completed</span>
          </div>

          {/* Summary strip */}
          <div className="px-6 py-3 bg-emerald-50/60 border-b border-emerald-100/60 flex flex-wrap gap-6 text-xs">
            <span className="text-muted-foreground">
              Allocated: <span className="font-bold text-foreground">{formatMinutes(detail.completed.allocatedMinutes)}</span>
            </span>
            <span className="text-muted-foreground">
              Actual: <span className="font-bold text-foreground">{formatMinutes(detail.completed.actualMinutes)}</span>
            </span>
            {detail.completed.actualMinutes > 0 && detail.completed.allocatedMinutes > 0 && (
              <span className="text-muted-foreground">
                Efficiency:{' '}
                <span
                  title="allocated ÷ actual × 100 — 100% = on estimate, >100% = faster, <100% = slower"
                  className={`font-bold cursor-help ${
                    detail.completed.actualMinutes <= detail.completed.allocatedMinutes
                      ? 'text-emerald-600'
                      : 'text-red-600'
                  }`}
                >
                  {Math.round((detail.completed.allocatedMinutes / detail.completed.actualMinutes) * 100)}%
                </span>
                {detail.completed.actualMinutes > detail.completed.allocatedMinutes && (
                  <span className="ml-1 text-red-500">(over estimate)</span>
                )}
              </span>
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/20 bg-muted/10">
                  <th className="text-left px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Task</th>
                  <th className="text-right px-4 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Allocated</th>
                  <th className="text-right px-4 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Actual</th>
                  <th className="text-right px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Variance</th>
                </tr>
              </thead>
              <tbody>
                {detail.completionHistory.map((h) => {
                  const delta = h.actual_minutes - h.allocated_minutes;
                  const saved = delta < -5;
                  const late = delta > 5;
                  const histStatus = h.status ?? 'COMPLETED';
                  return (
                    <tr key={h.id} className="border-b border-border/10 last:border-b-0 hover:bg-muted/10 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-foreground leading-snug max-w-[200px] truncate">{h.title}</p>
                          <TaskStatusBadge status={histStatus} />
                        </div>
                        {h.instance_name && <p className="text-[10px] text-primary mt-0.5">{h.instance_name}</p>}
                      </td>
                      <td className="px-4 py-4 text-right font-mono text-sm text-muted-foreground">{formatMinutes(h.allocated_minutes)}</td>
                      <td className="px-4 py-4 text-right font-mono text-sm text-muted-foreground">
                        {h.actual_minutes > 0 ? formatMinutes(h.actual_minutes) : '—'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {h.actual_minutes > 0 ? (
                          <span className={`inline-flex items-center gap-1 font-semibold text-xs ${saved ? 'text-emerald-600' : late ? 'text-red-600' : 'text-muted-foreground'}`}>
                            {saved && <TrendingDown className="h-3 w-3" />}
                            {late && <TrendingUp className="h-3 w-3" />}
                            {!saved && !late && <Minus className="h-3 w-3" />}
                            {saved ? `${formatMinutes(Math.abs(delta))} saved` : late ? `${formatMinutes(delta)} over` : 'On time'}
                          </span>
                        ) : <span className="text-muted-foreground/50 text-xs">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile list */}
          <div className="sm:hidden divide-y divide-border/10">
            {detail.completionHistory.map((h) => {
              const delta = h.actual_minutes - h.allocated_minutes;
              const saved = delta < -5;
              const late = delta > 5;
              const histStatus = h.status ?? 'COMPLETED';
              return (
                <div key={h.id} className="p-4">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <p className="font-semibold text-foreground text-sm">{h.title}</p>
                    <TaskStatusBadge status={histStatus} />
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>Allocated: <span className="font-mono font-semibold">{formatMinutes(h.allocated_minutes)}</span></span>
                    <span>Actual: <span className="font-mono font-semibold">{h.actual_minutes > 0 ? formatMinutes(h.actual_minutes) : '—'}</span></span>
                    {h.actual_minutes > 0 && (
                      <span className={`ml-auto font-semibold ${saved ? 'text-emerald-600' : late ? 'text-red-600' : 'text-muted-foreground'}`}>
                        {saved ? `−${formatMinutes(Math.abs(delta))}` : late ? `+${formatMinutes(delta)}` : '✓'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function WorkloadManagementTab() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [selectedDate, setSelectedDate]         = useState(getDateForOffset(0));
  const [summary,      setSummary]              = useState<WorkloadSummaryResponse | null>(null);
  const [loadingSummary, setLoadingSummary]     = useState(false);
  const [summaryError, setSummaryError]         = useState<string | null>(null);

  // Read memberId from URL search params for initial state
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(
    () => searchParams.get('memberId') || null
  );
  const [detail,           setDetail]           = useState<WorkloadMemberDetail | null>(null);
  const [loadingDetail,    setLoadingDetail]    = useState(false);
  const [detailError,      setDetailError]      = useState<string | null>(null);

  const [statusFilter, setStatusFilter]         = useState<WorkloadStatus | 'all'>('all');

  // Keep a ref to track date changes when a member is selected
  const prevDateRef = useRef(selectedDate);

  // Sync selectedMemberId → URL search params
  const updateUrlMemberId = useCallback((memberId: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (memberId) {
      params.set('memberId', memberId);
    } else {
      params.delete('memberId');
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [router, pathname, searchParams]);

  const fetchSummaryData = useCallback(async () => {
    setLoadingSummary(true);
    setSummaryError(null);
    try {
      setSummary(await fetchWorkloadSummary(selectedDate));
    } catch (err: any) {
      setSummaryError(err?.response?.data?.message || 'Failed to load workload data');
    } finally {
      setLoadingSummary(false);
    }
  }, [selectedDate]);

  useEffect(() => { fetchSummaryData(); }, [fetchSummaryData]);

  // When date changes and a member is selected, refetch that member's detail
  useEffect(() => {
    if (prevDateRef.current !== selectedDate && selectedMemberId) {
      // Date changed while viewing a member — refetch detail for new date
      const refetchDetail = async () => {
        setDetail(null);
        setDetailError(null);
        setLoadingDetail(true);
        try {
          setDetail(await fetchWorkloadMemberDetail(selectedMemberId, selectedDate));
        } catch (err: any) {
          setDetailError(err?.response?.data?.message || 'Failed to load member detail');
        } finally {
          setLoadingDetail(false);
        }
      };
      refetchDetail();
    }
    prevDateRef.current = selectedDate;
  }, [selectedDate, selectedMemberId]);

  // On mount, if memberId is in URL, fetch that member's detail
  useEffect(() => {
    const urlMemberId = searchParams.get('memberId');
    if (urlMemberId && !detail && !loadingDetail) {
      handleSelectMember(urlMemberId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectMember = useCallback(async (id: string) => {
    setSelectedMemberId(id);
    updateUrlMemberId(id);
    setDetail(null);
    setDetailError(null);
    setLoadingDetail(true);
    try {
      setDetail(await fetchWorkloadMemberDetail(id, selectedDate));
    } catch (err: any) {
      setDetailError(err?.response?.data?.message || 'Failed to load member detail');
    } finally {
      setLoadingDetail(false);
    }
  }, [selectedDate, updateUrlMemberId]);

  const handleBack = () => {
    setSelectedMemberId(null);
    updateUrlMemberId(null);
    setDetail(null);
    setDetailError(null);
  };

  const members = summary?.members ?? [];
  const stats   = summary?.summary;
  const displayedMembers = statusFilter === 'all' ? members : members.filter(m => m.status === statusFilter);

  return (
    <div className="space-y-6 pb-10">

      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground" style={{ fontFamily: 'Manrope, sans-serif' }}>
            Workload Management
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Daily capacity &amp; pace signal for every team member
          </p>
        </div>
        <button
          onClick={fetchSummaryData}
          disabled={loadingSummary}
          className="self-start sm:self-auto flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl border border-border/50 bg-white shadow-sm hover:shadow hover:border-foreground/20 transition-all disabled:opacity-50"
        >
          {loadingSummary ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
          Refresh
        </button>
      </div>

      {/* ── Date range control (matches rejection-analytics-tab filter bar) ── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">Date:</span>
          </div>

          <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg border border-border/40">
            {DATE_QUICK.map((opt) => {
              const d = getDateForOffset(opt.offset);
              const active = selectedDate === d;
              return (
                <button
                  key={opt.offset}
                  onClick={() => { setSelectedDate(d); }}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                    active ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <input
            type="date"
            value={selectedDate}
            onChange={(e) => { setSelectedDate(e.target.value); }}
            className="px-3 py-1.5 text-xs rounded-lg border border-border/40 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />

          <span className="ml-auto text-xs text-muted-foreground font-medium">
            {formatDateLabel(selectedDate)}
            {summary && <span className="ml-2 text-primary font-semibold">· {formatMinutes(summary.dailyCapacity)} capacity</span>}
          </span>
        </div>
      </div>

      {/* Non-working day banner */}
      {summary?.isNonWorkingDay && !loadingSummary && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <Sun className="h-5 w-5 text-amber-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Non-working day</p>
            <p className="text-xs text-amber-700">Daily capacity is 0 — this is a weekend or company holiday.</p>
          </div>
        </div>
      )}

      {/* Loading */}
      {loadingSummary && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error */}
      {summaryError && !loadingSummary && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-center gap-2 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {summaryError}
        </div>
      )}

      {/* ── Detail view ── */}
      {selectedMemberId && (
        <div>
          {loadingDetail && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {detailError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-center gap-2 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {detailError}
            </div>
          )}
          {detail && !loadingDetail && <MemberDetailView detail={detail} onBack={handleBack} />}
        </div>
      )}

      {/* ── List view ── */}
      {!selectedMemberId && !loadingSummary && summary && (
        <div className="space-y-6">

          {/* Summary stat cards — matches rejection-analytics-tab grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="text-3xl font-bold text-foreground">{stats?.memberCount ?? members.length}</div>
              <p className="text-xs text-muted-foreground mt-1">Team Members</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{members.filter(m => m.status !== 'NO_LOAD').length} active today</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <div className={`text-3xl font-bold ${(stats?.averageLoadedOccupancy ?? stats?.averageOccupancy ?? 0) > 100 ? 'text-red-600' : 'text-foreground'}`}>
                {stats && stats.memberCount > 0 ? `${stats.averageLoadedOccupancy ?? stats.averageOccupancy}%` : '—'}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Avg Occupancy (loaded)</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">All team: {stats?.averageOccupancyAllMembers ?? 0}%</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <div className={`text-3xl font-bold ${(stats?.overloadedMembers ?? 0) > 0 ? 'text-orange-600' : 'text-foreground'}`}>
                {stats?.overloadedMembers ?? 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Overloaded</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">occupancy &gt; 100%</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <div className={`text-3xl font-bold ${(stats?.delayedMembers ?? 0) > 0 ? 'text-red-600' : 'text-foreground'}`}>
                {stats?.delayedMembers ?? 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Delayed</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">overdue incomplete tasks</p>
            </div>
          </div>

          {/* Status filter pills — same pattern as task-tab */}
          <div className="flex flex-wrap gap-2">
            {(['all', 'DELAYED', 'BEHIND', 'ON_TIME', 'AHEAD', 'NO_LOAD'] as const).map((s) => {
              const active = statusFilter === s;
              const count  = s === 'all' ? members.length : members.filter(m => m.status === s).length;
              if (s !== 'all' && count === 0) return null;
              const cfg    = s !== 'all' ? STATUS_CONFIG[s] : null;
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                    active
                      ? cfg
                        ? `${cfg.bg} ${cfg.text} ${cfg.border} shadow-sm`
                        : 'bg-foreground text-background border-foreground shadow-sm'
                      : 'bg-white text-muted-foreground border-border/50 hover:border-foreground/20 hover:text-foreground'
                  }`}
                >
                  {s !== 'all' && cfg && <span className="text-[10px]">{cfg.icon}</span>}
                  {s === 'all' ? 'All Members' : STATUS_LABELS[s]}
                  <span className={`text-[10px] font-bold ${active ? 'opacity-70' : 'text-muted-foreground'}`}>
                    ({count})
                  </span>
                </button>
              );
            })}
          </div>

          {/* Member list (matches rejection-analytics-tab member cards) */}
          {displayedMembers.length === 0 ? (
            <div className="rounded-2xl border border-border/30 bg-white p-12 text-center shadow-sm">
              <div className="h-14 w-14 rounded-2xl bg-muted/30 flex items-center justify-center mx-auto mb-3">
                <Users className="h-7 w-7 opacity-20" />
              </div>
              <p className="font-semibold text-foreground">No members found</p>
              <p className="text-sm text-muted-foreground mt-1">No members match the selected filter.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {displayedMembers.map(m => (
                <MemberCard key={m.id} member={m} onSelect={handleSelectMember} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
