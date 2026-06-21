import { useState, useEffect, useCallback } from "react";
import {
    CalendarDays, ChevronDown, ChevronUp, User, Clock,
    TrendingDown, TrendingUp, Minus, Loader2, AlertCircle,
    CheckCircle2, Timer, BarChart3, Search
} from "lucide-react";
import api from "@/lib/api";
import TaskModal from "@/components/task/overdue-details-modal";
import Loader from "../ui/loader";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WorkloadTask {
    id: string;
    title: string;
    instance: string;
    client: string;
    status: string;
    estimated_minutes: number;
    turnaround_minutes: number;
    total_working_minutes: number;
    assigned_at: string | null;
    due_date: string | null;
    submitted_at: string | null;
    timeDelta: number | null; // negative = saved, positive = delayed
    roleType?: "worker" | "reviewer";
}

interface MemberWorkload {
    id: string;
    name: string;
    role: string;
    totalTasks: number;
    completedTasks: number;
    inProgressTasks: number;
    lockedTasks: number;
    totalMinutes: number;
    completedMinutes: number;
    tasks: WorkloadTask[];
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function getDateForOffset(offset: number): string {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toISOString().split("T")[0];
}

function formatDateLabel(dateStr: string): string {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatMinutes(mins: number): string {
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatTimeDelta(delta: number): { text: string; color: string; icon: "up" | "down" | "even" } {
    const abs = Math.abs(delta);
    const formatted = formatMinutes(abs);
    if (delta > 5) return { text: `${formatted} late`, color: "text-red-600", icon: "up" };
    if (delta < -5) return { text: `${formatted} saved`, color: "text-emerald-600", icon: "down" };
    return { text: "On time", color: "text-muted-foreground", icon: "even" };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_DAILY_MINUTES = 480; // 8 hours

const DATE_FILTERS = [
    { label: "Yesterday", offset: -1 },
    { label: "Today", offset: 0 },
    { label: "Tomorrow", offset: 1 },
    { label: "Day After", offset: 2 },
];

// ─── Progress bar color logic ─────────────────────────────────────────────────

function getProgressColor(completed: number, total: number): string {
    if (total === 0) return "bg-muted";
    const ratio = completed / total;
    if (ratio >= 1) return "bg-emerald-500";
    if (ratio >= 0.7) return "bg-amber-500";
    return "bg-red-500";
}

function getProgressBgColor(completed: number, total: number): string {
    if (total === 0) return "bg-muted/30";
    const ratio = completed / total;
    if (ratio >= 1) return "bg-emerald-50";
    if (ratio >= 0.7) return "bg-amber-50";
    return "bg-red-50";
}

function getCapacityColor(totalMinutes: number): string {
    // Logic: Utilization-based coloring
    // Green: High utilization (>= 7 hours)
    // Orange: Partial utilization (3h - 7h)
    // Red: Low utilization (< 3 hours)
    if (totalMinutes >= 420) return "text-emerald-600";
    if (totalMinutes >= 180) return "text-amber-600";
    return "text-red-600";
}

function getStatusBadge(status: string) {
    const map: Record<string, { label: string; cls: string }> = {
        COMPLETED: { label: "Completed", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
        APPROVED: { label: "Approved", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
        IN_PROGRESS: { label: "In Progress", cls: "bg-blue-100 text-blue-700 border-blue-200" },
        PENDING_APPROVAL: { label: "Pending Approval", cls: "bg-amber-100 text-amber-700 border-amber-200" },
        REJECTED: { label: "Rejected", cls: "bg-red-100 text-red-700 border-red-200" },
        LOCKED: { label: "Upcoming", cls: "bg-slate-100 text-slate-600 border-slate-200" },
    };
    const s = map[status] || { label: status, cls: "bg-muted text-muted-foreground border-border" };
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${s.cls}`}>
            {s.label}
        </span>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function WorkloadTab() {
    const [selectedDate, setSelectedDate] = useState(getDateForOffset(0));
    const [customMode, setCustomMode] = useState(false);
    const [customFrom, setCustomFrom] = useState(getDateForOffset(0));
    const [customTo, setCustomTo] = useState(getDateForOffset(0));
    const [expanded, setExpanded] = useState<string | null>(null);
    const [data, setData] = useState<MemberWorkload[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [roleFilter, setRoleFilter] = useState<"all" | "worker" | "reviewer">("all");

    // Task detail modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedTask, setSelectedTask] = useState<any>(null);
    const [taskDetailLoading, setTaskDetailLoading] = useState(false);

    const fetchWorkload = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = customMode
                ? { from: customFrom, to: customTo }
                : { date: selectedDate };
            const res = await api.get("/performance/workload", { params });
            const processedData = (res.data?.data || []).map((member: MemberWorkload) => ({
                ...member,
                tasks: member.tasks.map((task: WorkloadTask) => {
                    const isReviewer = task.title.includes("(Approval Required)");
                    return {
                        ...task,
                        title: task.title.replace(" (Approval Required)", ""),
                        roleType: isReviewer ? "reviewer" as const : "worker" as const
                    };
                })
            }));
            setData(processedData);
        } catch (err: any) {
            setError(err.response?.data?.message || "Failed to fetch workload data");
        } finally {
            setLoading(false);
        }
    }, [selectedDate, customMode, customFrom, customTo]);

    useEffect(() => {
        fetchWorkload();
    }, [fetchWorkload]);

    // Filter data by search query and role
    const filteredData = data.map(member => {
        const matchesSearch = member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            member.role.toLowerCase().includes(searchQuery.toLowerCase());
        
        if (!matchesSearch) return null;
        
        const filteredTasks = roleFilter === "all" 
            ? member.tasks 
            : member.tasks.filter(task => task.roleType === roleFilter);
        
        return {
            ...member,
            tasks: filteredTasks,
            totalTasks: filteredTasks.length,
            completedTasks: filteredTasks.filter(t => ["COMPLETED", "APPROVED"].includes(t.status)).length,
            inProgressTasks: filteredTasks.filter(t => ["IN_PROGRESS", "PENDING_APPROVAL", "REJECTED"].includes(t.status)).length,
            lockedTasks: filteredTasks.filter(t => t.status === "LOCKED").length,
            totalMinutes: filteredTasks.reduce((sum, t) => sum + (t.estimated_minutes || 0), 0),
            completedMinutes: filteredTasks.filter(t => ["COMPLETED", "APPROVED"].includes(t.status)).reduce((sum, t) => sum + (t.estimated_minutes || 0), 0)
        };
    }).filter(Boolean) as MemberWorkload[];

    // Fetch full task detail when clicking a task row
    const handleTaskClick = async (taskId: string) => {
        setTaskDetailLoading(true);

        try {
            const { data } = await api.get(`/tasks/detail/${taskId}`);
            setSelectedTask(data.data || data);
            setIsModalOpen(true);
        } catch {
            setSelectedTask(null);
        } finally {
            setTaskDetailLoading(false);
        }
    };

    const displayDate = customMode
        ? `${formatDateLabel(customFrom)} → ${formatDateLabel(customTo)}`
        : formatDateLabel(selectedDate);

    // Aggregate stats (always based on full data or filtered? Let's use filtered for consistency)
    const totalTasks = filteredData.reduce((s, m) => s + m.totalTasks, 0);
    const totalCompleted = filteredData.reduce((s, m) => s + m.completedTasks, 0);
    const totalMinutes = filteredData.reduce((s, m) => s + m.totalMinutes, 0);

    return (
        <div className="space-y-4">
            {/* Date Filter Card */}
            <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                            <CalendarDays className="h-4 w-4 text-foreground" />
                            <h3 className="text-base font-semibold text-foreground">Workload View</h3>
                        </div>
                        <p className="text-xs text-muted-foreground mb-3">
                            Select a date to view team workload and time efficiency.
                        </p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3">
                        {/* Role Filter */}
                        <div className="flex gap-1 p-1 rounded-lg border border-border bg-muted/30">
                            <button
                                onClick={() => setRoleFilter("all")}
                                className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
                                    roleFilter === "all"
                                        ? "bg-background text-foreground shadow-sm"
                                        : "text-muted-foreground hover:text-foreground"
                                }`}
                            >
                                All Roles
                            </button>
                            <button
                                onClick={() => setRoleFilter("worker")}
                                className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
                                    roleFilter === "worker"
                                        ? "bg-background text-foreground shadow-sm"
                                        : "text-muted-foreground hover:text-foreground"
                                }`}
                            >
                                Worker Tasks
                            </button>
                            <button
                                onClick={() => setRoleFilter("reviewer")}
                                className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
                                    roleFilter === "reviewer"
                                        ? "bg-background text-foreground shadow-sm"
                                        : "text-muted-foreground hover:text-foreground"
                                }`}
                            >
                                Reviewer Tasks
                            </button>
                        </div>

                        {/* Search Box */}
                        <div className="relative w-full sm:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="Search member..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary transition-all"
                            />
                        </div>
                    </div>
                </div>

                <div className="h-px bg-border/50 my-4" />

                {/* Quick date buttons */}
                {/* Quick date buttons */}
                <div className="flex flex-wrap gap-2 mb-3">
                    {DATE_FILTERS.map(opt => {
                        const dateVal = getDateForOffset(opt.offset);
                        const isActive = (!customMode && selectedDate === dateVal) || (customMode && customFrom === customTo && customFrom === dateVal);
                        return (
                            <button
                                key={opt.offset}
                                onClick={() => {
                                    setCustomMode(false);
                                    setSelectedDate(dateVal);
                                    setCustomFrom(dateVal);
                                    setCustomTo(dateVal);
                                }}
                                className={`px-3 py-1.5 text-xs rounded-md border font-medium transition-colors ${isActive
                                    ? "bg-foreground text-background border-foreground"
                                    : "bg-background text-foreground border-border hover:border-foreground"
                                    }`}
                            >
                                {opt.label}
                            </button>
                        );
                    })}
                    <button
                        onClick={() => setCustomMode(true)}
                        className={`px-3 py-1.5 text-xs rounded-md border font-medium transition-colors ${customMode && !(customFrom === customTo && DATE_FILTERS.some(opt => getDateForOffset(opt.offset) === customFrom))
                            ? "bg-foreground text-background border-foreground"
                            : "bg-background text-foreground border-border hover:border-foreground"
                            }`}
                    >
                        Custom Range
                    </button>
                </div>

                {/* Custom date inputs */}
                {customMode && (
                    <div className="flex items-center gap-3 mb-3">
                        <input
                            type="date"
                            value={customFrom}
                            onChange={e => {
                                const val = e.target.value;
                                setCustomFrom(val);
                                if (val === customTo) {
                                    setSelectedDate(val);
                                    const matchingQuick = DATE_FILTERS.find(opt => getDateForOffset(opt.offset) === val);
                                    if (matchingQuick) {
                                        setCustomMode(false);
                                    }
                                }
                            }}
                            className="px-3 py-1.5 text-xs rounded-md border border-border bg-background text-foreground"
                        />
                        <span className="text-xs text-muted-foreground">to</span>
                        <input
                            type="date"
                            value={customTo}
                            onChange={e => {
                                const val = e.target.value;
                                setCustomTo(val);
                                if (customFrom === val) {
                                    setSelectedDate(val);
                                    const matchingQuick = DATE_FILTERS.find(opt => getDateForOffset(opt.offset) === val);
                                    if (matchingQuick) {
                                        setCustomMode(false);
                                    }
                                }
                            }}
                            className="px-3 py-1.5 text-xs rounded-md border border-border bg-background text-foreground"
                        />
                    </div>
                )}

                <p className="text-xs text-muted-foreground">
                    Showing: <span className="font-medium text-foreground">{displayDate}</span>
                </p>
            </div>

            {/* Aggregate Summary */}
            {!loading && filteredData.length > 0 && (
                <div className="grid  grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="rounded-xl border border-border bg-card p-4">
                        <div className="flex items-center gap-2 mb-1">
                            <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total Tasks</span>
                        </div>
                        <p className="text-2xl font-bold text-foreground">{totalTasks}</p>
                        <p className="text-[10px] text-muted-foreground">{totalCompleted} completed</p>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-4">
                        <div className="flex items-center gap-2 mb-1">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total Estimated Work</span>
                        </div>
                        <p className="text-2xl font-bold text-foreground">{formatMinutes(totalMinutes)}</p>
                        <p className="text-[10px] text-muted-foreground">across {filteredData.filter(m => m.totalTasks > 0).length} members</p>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-4">
                        <div className="flex items-center gap-2 mb-1">
                            <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Completion</span>
                        </div>
                        <p className="text-2xl font-bold text-foreground">
                            {totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0}%
                        </p>
                        <p className="text-[10px] text-muted-foreground">{totalCompleted}/{totalTasks} tasks</p>
                    </div>
                </div>
            )}

            {/* Loading */}
            {loading && (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    {error}
                </div>
            )}

            {/* Empty state */}
            {!loading && !error && filteredData.length === 0 && (
                <div className="rounded-xl border border-border bg-card p-12 text-center">
                    <Search className="h-8 w-8 text-muted-foreground mx-auto mb-3 opacity-20" />
                    <p className="text-sm text-muted-foreground">No members found matching your search.</p>
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery("")}
                            className="mt-3 text-xs text-primary font-medium hover:underline"
                        >
                            Clear search
                        </button>
                    )}
                </div>
            )}

            {/* Member Cards */}
            {!loading && filteredData.map(m => {
                const progressPercent = m.totalTasks > 0 ? Math.round((m.completedTasks / m.totalTasks) * 100) : 0;
                const isExpanded = expanded === m.id;
                const progressColor = getProgressColor(m.completedTasks, m.totalTasks);
                const progressBg = getProgressBgColor(m.completedTasks, m.totalTasks);
                const capacityPercent = MAX_DAILY_MINUTES > 0 ? Math.round((m.totalMinutes / MAX_DAILY_MINUTES) * 100) : 0;
                const capacityColor = getCapacityColor(m.totalMinutes);

                // Hide progress bar for future dates
                const isFutureDate = !customMode && new Date(selectedDate) > new Date(getDateForOffset(0));
                console.log(filteredData);


                return (
                   <div key={m.id} className="rounded-xl border border-border bg-card overflow-hidden">
                       {/* Header */}
                       <div
                           className="flex items-center justify-between p-3 sm:p-5 cursor-pointer hover:bg-muted/20 transition-colors"
                           onClick={() => setExpanded(isExpanded ? null : m.id)}
                       >
                           <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                               <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                                   <User className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
                               </div>
                               <div className="min-w-0 flex-1">
                                   <p className="text-sm font-semibold text-foreground truncate">{m.name}</p>
                                   <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{m.role}</p>
                               </div>
                           </div>
                   
                           {/* Mobile: Compact stats */}
                           <div className="flex items-center gap-2 sm:hidden">
                               <div className="text-right">
                                   <p className="text-xs font-bold text-foreground">
                                       {isFutureDate ? m.totalTasks : `${m.completedTasks}/${m.totalTasks}`}
                                   </p>
                                   <p className="text-[9px] text-muted-foreground">Tasks</p>
                               </div>
                               {isExpanded
                                   ? <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                   : <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                               }
                           </div>
                   
                           {/* Desktop: Full stats */}
                           <div className="hidden sm:flex items-center gap-6 text-sm">
                               {/* Task count */}
                               <div className="text-right">
                                   <p className="text-xs text-muted-foreground">Tasks</p>
                                   <p className="font-bold text-foreground">
                                       {isFutureDate ? m.totalTasks : `${m.completedTasks}/${m.totalTasks}`}
                                   </p>
                               </div>
                   
                               {/* Estimated workload with capacity indicator */}
                               <div className="text-right">
                                   <p className="text-xs text-muted-foreground">Estimated Work</p>
                                   <p className={`font-bold flex items-center justify-end gap-1 ${capacityColor}`}>
                                       <Timer className="h-3 w-3" />
                                       {formatMinutes(m.totalMinutes)}
                                       <span className="text-[10px] font-normal text-muted-foreground">
                                           / {formatMinutes(MAX_DAILY_MINUTES)}
                                       </span>
                                   </p>
                               </div>
                   
                               {/* Progress bar - Hidden for future dates */}
                               {!isFutureDate && (
                                   <div className="w-32">
                                       <div className="flex items-center justify-between mb-1">
                                           <span className="text-[10px] text-muted-foreground">Progress</span>
                                           <span className="text-[10px] font-bold text-foreground">{progressPercent}%</span>
                                       </div>
                                       <div className={`h-2 rounded-full ${progressBg} overflow-hidden`}>
                                           <div
                                               className={`h-full rounded-full ${progressColor} transition-all duration-500`}
                                               style={{ width: `${progressPercent}%` }}
                                           />
                                       </div>
                                   </div>
                               )}
                   
                               {/* Expand icon */}
                               {isExpanded
                                   ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                   : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                               }
                           </div>
                       </div>
                   
                       {/* Mobile: Additional stats row when collapsed */}
                       {!isExpanded && (
                           <div className="px-3 pb-3 sm:hidden">
                               <div className="flex items-center justify-between text-xs">
                                   <div className="flex items-center gap-1">
                                       <Timer className="h-3 w-3 text-muted-foreground" />
                                       <span className={`font-medium ${capacityColor}`}>
                                           {formatMinutes(m.totalMinutes)}
                                       </span>
                                       <span className="text-muted-foreground">work</span>
                                   </div>
                                   {!isFutureDate && (
                                       <div className="flex items-center gap-2">
                                           <span className="text-muted-foreground">Progress:</span>
                                           <div className="flex items-center gap-1">
                                               <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden">
                                                   <div
                                                       className={`h-full rounded-full ${progressColor} transition-all duration-500`}
                                                       style={{ width: `${progressPercent}%` }}
                                                   />
                                               </div>
                                               <span className="font-medium text-foreground">{progressPercent}%</span>
                                           </div>
                                       </div>
                                   )}
                               </div>
                           </div>
                       )}
                   
                       {/* Expanded task list */}
                       {isExpanded && (
                           <div className="border-t border-border">
                               {/* Status summary bar */}
                               <div className="flex flex-wrap items-center gap-2 sm:gap-4 px-3 sm:px-5 py-3 bg-muted/20 text-xs">
                                   {m.inProgressTasks > 0 && (
                                       <span className="flex items-center gap-1">
                                           <span className="h-2 w-2 rounded-full bg-blue-500" />
                                           <span className="text-muted-foreground">In Progress:</span>
                                           <span className="font-semibold text-foreground">{m.inProgressTasks}</span>
                                       </span>
                                   )}
                                   {!isFutureDate && m.completedTasks > 0 && (
                                       <span className="flex items-center gap-1">
                                           <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                           <span className="text-muted-foreground">Completed:</span>
                                           <span className="font-semibold text-foreground">{m.completedTasks}</span>
                                       </span>
                                   )}
                                   {m.lockedTasks > 0 && (
                                       <span className="flex items-center gap-1">
                                           <span className="h-2 w-2 rounded-full bg-slate-400" />
                                           <span className="text-muted-foreground">Upcoming:</span>
                                           <span className="font-semibold text-foreground">{m.lockedTasks}</span>
                                       </span>
                                   )}
                                   <span className="ml-auto text-muted-foreground hidden sm:block">
                                       {!isFutureDate ? (
                                           <>
                                               Completed: <span className="font-semibold text-foreground">{formatMinutes(m.completedMinutes)}</span>
                                               <span className="mx-1">/</span>
                                           </>
                                       ) : null}
                                       Total Estimated: <span className="font-semibold text-foreground">{formatMinutes(m.totalMinutes)}</span>
                                   </span>
                               </div>
                   
                               {/* Mobile: Time summary */}
                               <div className="px-3 py-2 bg-muted/10 border-b border-border sm:hidden">
                                   <div className="text-xs text-muted-foreground">
                                       {!isFutureDate ? (
                                           <>
                                               Completed: <span className="font-semibold text-foreground">{formatMinutes(m.completedMinutes)}</span>
                                               <span className="mx-1">/</span>
                                           </>
                                       ) : null}
                                       Total Estimated: <span className="font-semibold text-foreground">{formatMinutes(m.totalMinutes)}</span>
                                   </div>
                               </div>
                   
                               {/* Task list */}
                               {m.tasks.length === 0 ? (
                                   <div className="px-3 sm:px-5 py-6 text-center text-xs text-muted-foreground">
                                       No tasks for this date range.
                                   </div>
                               ) : (
                                   <>
                                       {/* Mobile: Card layout */}
                                       <div className="sm:hidden">
                                           {m?.tasks?.map(t => {
                                               const delta = t.timeDelta != null ? formatTimeDelta(t.timeDelta) : null;
                                               const isOverdue = t.due_date && new Date(t.due_date) < new Date()
                                                   && !["COMPLETED", "APPROVED"].includes(t.status);
                   
                                               return (
                                                   <div
                                                       key={t.id}
                                                       className={`border-b border-border/50 p-3 cursor-pointer hover:bg-muted/20 transition-colors ${isOverdue ? "bg-red-50/30" : ""}`}
                                                       onClick={() => handleTaskClick(t.id)}
                                                   >
                                                       <div className="flex items-start justify-between mb-2">
                                                           <div className="flex-1 min-w-0">
                                                               <div className="flex items-center gap-2 mb-1">
                                                                   <p className="font-medium text-foreground text-sm truncate">{t.title}</p>
                                                                   <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                                                                       t.roleType === "reviewer"
                                                                           ? "bg-purple-100 text-purple-700 border border-purple-200"
                                                                           : "bg-blue-100 text-blue-700 border border-blue-200"
                                                                   }`}>
                                                                       {t.roleType === "reviewer" ? "Reviewer" : "Worker"}
                                                                   </span>
                                                               </div>
                                                               {t.client !== "—" && (
                                                                   <p className="text-[10px] text-muted-foreground">{t.client}</p>
                                                               )}
                                                               <p className="text-xs text-primary font-medium truncate">{t.instance}</p>
                                                           </div>
                                                           <div className="ml-2 flex-shrink-0">
                                                               {getStatusBadge(t.status)}
                                                           </div>
                                                       </div>
                                                       
                                                       <div className="grid grid-cols-2 gap-2 text-xs">
                                                           <div>
                                                               <span className="text-muted-foreground">Est:</span>
                                                               <span className="ml-1 font-mono">
                                                                   {t.estimated_minutes > 0 ? formatMinutes(t.estimated_minutes) : "—"}
                                                               </span>
                                                           </div>
                                                           <div>
                                                               <span className="text-muted-foreground">Actual:</span>
                                                               <span className="ml-1 font-mono">
                                                                   {t.total_working_minutes > 0 ? formatMinutes(t.total_working_minutes) : "—"}
                                                               </span>
                                                           </div>
                                                           <div>
                                                               <span className="text-muted-foreground">Turnaround:</span>
                                                               <span className="ml-1 font-mono">
                                                                   {t.turnaround_minutes > 0 ? formatMinutes(t.turnaround_minutes) : "—"}
                                                               </span>
                                                           </div>
                                                           <div>
                                                               <span className="text-muted-foreground">Efficiency:</span>
                                                               <span className="ml-1">
                                                                   {delta ? (
                                                                       <span className={`inline-flex items-center gap-1 font-semibold ${delta.color}`}>
                                                                           {delta.icon === "up" && <TrendingUp className="h-3 w-3" />}
                                                                           {delta.icon === "down" && <TrendingDown className="h-3 w-3" />}
                                                                           {delta.icon === "even" && <Minus className="h-3 w-3" />}
                                                                           {delta.text}
                                                                       </span>
                                                                   ) : isOverdue ? (
                                                                       <span className="text-red-600 font-semibold flex items-center gap-1">
                                                                           <AlertCircle className="h-3 w-3" />
                                                                           Overdue
                                                                       </span>
                                                                   ) : (
                                                                       <span className="text-muted-foreground">—</span>
                                                                   )}
                                                               </span>
                                                           </div>
                                                       </div>
                                                   </div>
                                               );
                                           })}
                                       </div>
                   
                                       {/* Desktop: Table layout */}
                                       <div className="hidden sm:block overflow-x-auto">
                                           <table className="w-full text-xs">
                                               <thead>
                                                   <tr className="border-b border-border bg-muted/10">
                                                       <th className="text-left py-2.5 px-5 font-medium text-muted-foreground">
                                                           <div className="flex items-center gap-2">
                                                               {taskDetailLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                                                               Task
                                                           </div>
                                                       </th>
                                                       <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Role</th>
                                                       <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Instance</th>
                                                       <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Status</th>
                                                       <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">Estimated</th>
                                                       <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">Turnaround</th>
                                                       <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">Actual</th>
                                                       <th className="text-right py-2.5 px-5 font-medium text-muted-foreground">Efficiency</th>
                                                   </tr>
                                               </thead>
                                               <tbody>
                                                   {m?.tasks?.map(t => {
                                                       const delta = t.timeDelta != null ? formatTimeDelta(t.timeDelta) : null;
                                                       const isOverdue = t.due_date && new Date(t.due_date) < new Date()
                                                           && !["COMPLETED", "APPROVED"].includes(t.status);
                   
                                                       return (
                                                           <tr
                                                               key={t.id}
                                                               className={`border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer ${isOverdue ? "bg-red-50/30" : ""}`}
                                                               onClick={() => handleTaskClick(t.id)}
                                                           >
                                                               <td className="py-3 px-5">
                                                                   <p className="font-medium text-foreground truncate max-w-[200px]">{t.title}</p>
                                                                   {t.client !== "—" && (
                                                                       <p className="text-[10px] text-muted-foreground">{t.client}</p>
                                                                   )}
                                                               </td>
                                                               <td className="py-3 px-3">
                                                                   <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                                                       t.roleType === "reviewer"
                                                                           ? "bg-purple-100 text-purple-700 border-purple-200"
                                                                           : "bg-blue-100 text-blue-700 border-blue-200"
                                                                   }`}>
                                                                       {t.roleType === "reviewer" ? "Reviewer" : "Worker"}
                                                                   </span>
                                                               </td>
                                                               <td className="py-3 px-3 text-primary font-medium truncate max-w-[120px]">{t.instance}</td>
                                                               <td className="py-3 px-3">{getStatusBadge(t.status)}</td>
                                                               <td className="py-3 px-3 text-right text-muted-foreground font-mono">
                                                                   {t.estimated_minutes > 0 ? formatMinutes(t.estimated_minutes) : "—"}
                                                               </td>
                                                               <td className="py-3 px-3 text-right text-muted-foreground font-mono">
                                                                   {t.turnaround_minutes > 0 ? formatMinutes(t.turnaround_minutes) : "—"}
                                                               </td>
                                                               <td className="py-3 px-3 text-right font-mono">
                                                                   {t.total_working_minutes > 0
                                                                       ? <span className="text-foreground">{formatMinutes(t.total_working_minutes)}</span>
                                                                       : <span className="text-muted-foreground">—</span>
                                                                   }
                                                               </td>
                                                               <td className="py-3 px-5 text-right">
                                                                   {delta ? (
                                                                       <span className={`inline-flex items-center gap-1 font-semibold ${delta.color}`}>
                                                                           {delta.icon === "up" && <TrendingUp className="h-3 w-3" />}
                                                                           {delta.icon === "down" && <TrendingDown className="h-3 w-3" />}
                                                                           {delta.icon === "even" && <Minus className="h-3 w-3" />}
                                                                           {delta.text}
                                                                       </span>
                                                                   ) : isOverdue ? (
                                                                       <span className="text-red-600 font-semibold flex items-center justify-end gap-1">
                                                                           <AlertCircle className="h-3 w-3" />
                                                                           Overdue
                                                                       </span>
                                                                   ) : (
                                                                       <span className="text-muted-foreground">—</span>
                                                                   )}
                                                               </td>
                                                           </tr>
                                                       );
                                                   })}
                                               </tbody>
                                           </table>
                                       </div>
                                   </>
                               )}
                           </div>
                       )}
                   </div>
                );
            })}

            {/* Task Detail Modal — reuses existing overdue-details-modal */}
            <TaskModal
                isModalOpen={isModalOpen}
                setIsModalOpen={(open: boolean) => {
                    setIsModalOpen(open);
                    if (!open) setSelectedTask(null);
                }}
                selectedTask={selectedTask}
            />
        </div>
    );
}