'use client';

import React, { useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/zustand/user/user';
import { useUserStore } from '@/lib/zustand/user/addUser';
import { useProjectStore } from '@/lib/zustand/projects/createproject';
import { useTaskStore } from '@/lib/zustand/tasks/tasks';
import { useRouter } from 'next/navigation';
import {
    Users, FolderKanban, CheckSquare, Activity, LogOut, BarChart3, Settings, Shield, Info
} from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import BottomNav from '@/components/dashboard/bottom-nav';
import { Button, Input, Badge, Avatar, AvatarFallback, Select, Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuItem, Card } from '@/components/ui';
import { AddUserModal } from '@/components/user/add-user-modal';
import { AddClientModal } from '@/components/clients/add-client-modal';
import { useToast } from '@/components/ui/toast';
import { TaskRow } from '@/lib/types/auth';
import { useClientStore } from '@/lib/zustand/clients/client';
import { StatsCard } from '@/components/shared-components/stats-card';
import ClientsTab from '@/components/clients/clients_tab';
import ProjectsTab from '@/components/projects/project-tab';
import TasksTab from '@/components/task/task-tab';
import UsersTab from '@/components/user/user-tab';
import CompanySettings from '@/components/holiday/holiday';
import ReportsTab from '@/components/reports/page';
import PermissionsTab from '@/components/permissions/page';
import api from '@/lib/api';
import { useStatsStore } from '@/lib/zustand/stats/dashboard-stats';
import OverviewTab from '@/components/dashboard/overview-tab';
import { useInstanceStore } from '@/lib/zustand/instances/instances';
import ControllerPerformance from '@/components/dashboard/controller-performance';
import WorkloadManagementTab from '@/components/workload/WorkloadManagementTab';

type Tab = 'users' | 'tasks' | 'clients' | 'templates' | 'permissions' | 'reports' | 'settings' | 'holidays' | 'performance' | 'workload';


export default function AdminDashboard() {
    const router = useRouter();
    const { user, isAuthenticated } = useAuthStore();
    const { users, usercount, loading: usersLoading } = useUserStore();
    const { projects, projectscount, projectsloading } = useProjectStore();
    const { allTasks, loading: tasksLoading } = useTaskStore();
    const { addToast } = useToast();

    const [activeTab, setActiveTab] = useState<Tab>('users');
    const [userSearch, setUserSearch] = useState('');
    const [userRoleFilter, setUserRoleFilter] = useState('all');
    const [isAddUserOpen, setIsAddUserOpen] = useState(false);
    const [isAddClientOpen, setIsAddClientOpen] = useState(false);

    const { stats, fetchStats, statsLoading } = useStatsStore()
    const { instances, fetchInstances } = useInstanceStore();

    useEffect(() => {
        fetchStats();
        fetchInstances();
    }, []);

    // ── System Health Score Computation ──
    const computeSystemHealth = (): { score: number; label: string; color: string; breakdown: { taskHealth: number; workflowHealth: number; userHealth: number } } | null => {
        if (!stats) return null;

        const activeTasks = stats.activeTasks ?? 0;
        const overdueTasks = stats.overdueTasks ?? 0;
        const instancesCount = stats.activeInstances ?? 0;
        const usersCount = stats.users ?? 0;

        // Task SLA Health (50%): penalise overdue tasks
        const taskHealth = activeTasks > 0
            ? Math.max(0, 1 - overdueTasks / activeTasks)
            : 1;

        // Workflow Activity Health (30%): at least one running instance = healthy
        const workflowHealth = instancesCount > 0 ? 1 : 0.5;

        // User Engagement Health (20%): scales to having ≥5 users
        const userHealth = Math.min(usersCount / 5, 1);

        const score = Math.min(100, Math.max(0, Math.round(taskHealth * 50 + workflowHealth * 30 + userHealth * 20)));

        let label = 'All systems operational';
        let color = 'text-green-600';
        if (score < 50) { label = 'Critical — needs attention'; color = 'text-red-500'; }
        else if (score < 70) { label = 'Performance degraded'; color = 'text-orange-500'; }
        else if (score < 90) { label = 'Minor issues detected'; color = 'text-amber-500'; }

        return { score, label, color, breakdown: { taskHealth: Math.round(taskHealth * 100), workflowHealth: Math.round(workflowHealth * 100), userHealth: Math.round(userHealth * 100) } };
    };

    const healthData = computeSystemHealth();


    // Lazy load full data based on active tab

    const tabs: { key: Tab; label: string }[] = [
        // { key: 'overview', label: 'Overview' },

        { key: 'users', label: 'Users' },
        { key: 'templates', label: 'Templates' },
        // { key: 'tasks', label: 'Tasks' },
        { key: 'clients', label: 'Clients' },
        { key: 'permissions', label: 'Permissions' },
        { key: 'performance', label: 'Performance' },
        { key: 'workload', label: 'Workload' },
        { key: 'reports', label: 'Reports' },
        { key: 'settings', label: 'Settings' },];



    return (
        <div className="min-h-screen bg-background p-6 pb-32 md:pb-6">

            {/* ─── Header ─── */}
            <div className="mb-6">
                <div className="flex items-start justify-between gap-3">
                    {/* Left: Title block */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Admin Dashboard</h1>
                            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                                System Control
                            </span>
                        </div>
                        <p className="text-sm text-muted-foreground">Full system access and management capabilities</p>
                    </div>

                    {/* Desktop layout */}
                    <div className="hidden sm:flex items-center gap-3 shrink-0">
                        <Badge variant="outline" className="text-xs px-3 py-1">Administrator</Badge>
                        <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold">
                                {user?.name?.slice(0, 1).toUpperCase() || 'A'}
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    useAuthStore.getState().logout();
                                    router.push('/login');
                                }}
                                className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 px-2"
                            >
                                <LogOut className="h-4 w-4 mr-1" />
                                <span className="text-xs">Logout</span>
                            </Button>
                        </div>
                    </div>

                    {/* Mobile dropdown */}
                    <div className="sm:hidden shrink-0">
                        <DropdownMenu>
                            <DropdownMenuTrigger>
                                <button className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold ring-2 ring-primary/20 focus:outline-none">
                                    {user?.name?.slice(0, 1).toUpperCase() || 'A'}
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                                {/* User info */}
                                <div className="px-3 py-2 border-b border-border">
                                    <p className="text-sm font-semibold text-foreground truncate">
                                        {user?.name || 'User'}
                                    </p>
                                    <p className="text-xs text-muted-foreground truncate">
                                        {user?.email || ''}
                                    </p>
                                </div>

                                {/* Badge */}
                                <div className="px-3 py-2 border-b border-border">
                                    <Badge variant="outline" className="text-xs px-2 py-0.5">Administrator</Badge>
                                </div>

                                <DropdownMenuSeparator />

                                {/* Logout */}
                                <DropdownMenuItem
                                    className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"
                                    onClick={() => {
                                        useAuthStore.getState().logout();
                                        router.push('/landing');
                                    }}
                                >
                                    <LogOut className="h-4 w-4 mr-2" />
                                    <span className="text-sm">Logout</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
            </div>


            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 py-4 mb-6">
                <Card
                    onClick={() => setActiveTab('users')}
                    className="w-full border-none shadow-sm hover:shadow-md transition-all bg-white p-6 min-h-[80px] flex flex-col justify-between relative group cursor-pointer"
                >
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-semibold text-slate-600 tracking-tight">Total Users</span>
                        <span className="text-slate-400"><Users className="h-5 w-5 text-blue-600" /></span>
                    </div>
                    <div className={cn("text-4xl font-black leading-none tracking-tight mb-2 flex")}>
                        {statsLoading ? '...' : String(stats?.users || 0)}

                    </div>
                    <p className="text-sm text-slate-400">Active users</p>
                </Card>

                <Card
                    onClick={() => setActiveTab('templates')}
                    className="w-full border-none shadow-sm hover:shadow-md transition-all bg-white p-6 min-h-[80px] flex flex-col justify-between relative group cursor-pointer"
                >
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-semibold text-slate-600 tracking-tight">Total Templates</span>
                        <span className="text-slate-400"><FolderKanban className="h-5 w-5 text-purple-600" /></span>
                    </div>
                    <div className={cn("text-4xl font-black leading-none tracking-tight mb-2")}>
                        {statsLoading ? '...' : String(stats?.projects || 0)}
                    </div>
                    <p className="text-sm text-slate-400">System templates</p>
                </Card>

                <Card
                    className="w-full border-none shadow-sm hover:shadow-md transition-all bg-white p-6 min-h-[80px] flex flex-col justify-between relative group"
                >
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-semibold text-slate-600 tracking-tight">Active Tasks</span>
                        <span className="text-slate-400"><CheckSquare className="h-5 w-5 text-amber-600" /></span>
                    </div>
                    <div className={cn("text-4xl font-black leading-none tracking-tight mb-2")}>
                        {statsLoading ? '...' : String(stats?.activeTasks || 0)}
                    </div>
                    <p className="text-sm text-slate-400">In progress</p>
                </Card>

                <Card className="w-full border-none shadow-sm hover:shadow-md transition-all bg-white p-6 min-h-[80px] flex flex-col justify-between relative group">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-1.5">
                            <span className="text-sm font-semibold text-slate-600 tracking-tight">System Health</span>
                            <Tooltip delay={100}>
                                <TooltipTrigger asChild>
                                    <button className="focus:outline-none">
                                        <Info className="h-3.5 w-3.5 text-slate-400 shrink-0 hover:text-primary transition-colors cursor-help" />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent
                                    side="bottom"
                                    className="z-50 w-68 sm:w-72 max-w-[calc(100vw-2rem)] !px-4 !py-4 rounded-xl border border-border bg-white shadow-xl text-foreground mt-3 !-translate-x-[30%] sm:!right-0 sm:!left-auto sm:!-translate-x-0"
                                >
                                    <p className="text-xs font-semibold text-foreground mb-3">How System Health is calculated</p>
                                    <div className="space-y-2.5">
                                        {/* Task SLA */}
                                        <div>
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-xs font-medium text-foreground">Task SLA Rate</span>
                                                <span className="text-xs font-bold text-foreground">
                                                    {healthData ? `${healthData.breakdown.taskHealth}%` : '—'}
                                                    <span className="text-muted-foreground font-normal ml-1">× 50</span>
                                                </span>
                                            </div>
                                            <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                                                <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${healthData?.breakdown.taskHealth ?? 0}%` }} />
                                            </div>
                                            <p className="text-[10px] text-slate-400 mt-1">Non-overdue active tasks ÷ total active tasks</p>
                                        </div>
                                        {/* Workflow Activity */}
                                        <div>
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-xs font-medium text-foreground">Workflow Activity</span>
                                                <span className="text-xs font-bold text-foreground">
                                                    {healthData ? `${healthData.breakdown.workflowHealth}%` : '—'}
                                                    <span className="text-muted-foreground font-normal ml-1">× 30</span>
                                                </span>
                                            </div>
                                            <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                                                <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${healthData?.breakdown.workflowHealth ?? 0}%` }} />
                                            </div>
                                            <p className="text-[10px] text-slate-400 mt-1">Active workflow instances running (100% if ≥1)</p>
                                        </div>
                                        {/* User Engagement */}
                                        <div>
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-xs font-medium text-foreground">User Engagement</span>
                                                <span className="text-xs font-bold text-foreground">
                                                    {healthData ? `${healthData.breakdown.userHealth}%` : '—'}
                                                    <span className="text-muted-foreground font-normal ml-1">× 20</span>
                                                </span>
                                            </div>
                                            <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                                                <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${healthData?.breakdown.userHealth ?? 0}%` }} />
                                            </div>
                                            <p className="text-[10px] text-slate-400 mt-1">Active users relative to team target (≥5 = 100%)</p>
                                        </div>
                                    </div>
                                    <div className="mt-3 pt-3 border-t border-slate-100">
                                        <span className="text-[10px] text-slate-400">Score = (SLA×50) + (Activity×30) + (Users×20)</span>
                                    </div>
                                </TooltipContent>
                            </Tooltip>
                        </div>
                        <span className="text-slate-400">
                            <Activity className={cn("h-5 w-5", healthData?.color ?? 'text-green-600')} />
                        </span>
                    </div>
                    <div className={cn("text-4xl font-black leading-none tracking-tight mb-2", healthData?.color ?? 'text-green-600')}>
                        {statsLoading || !healthData ? '...' : `${healthData.score}%`}
                    </div>
                    <p className={cn("text-sm", healthData?.color ?? 'text-slate-400')}>
                        {statsLoading || !healthData ? 'Loading...' : healthData.label}
                    </p>
                </Card>
            </div>


            {/* ─── Tab Bar (Desktop - Premium Pill Design) ─── */}
            <div className="hidden md:block mb-8 mt-2 top-[72px] z-30 bg-background/50 backdrop-blur-sm -mx-2 px-2 py-2">
                <div className="p-1 bg-muted/40 rounded-2xl border border-border/40 inline-flex items-center gap-1">
                    {tabs.map((t) => {
                        const isActive = activeTab === t.key;
                        let count = 0;
                        if (t.key === 'users') count = usercount || 0;
                        if (t.key === 'templates') count = projectscount || 0;
                        if (t.key === 'tasks') count = stats?.activeTasks || 0;
                        // if (t.key === 'clients') count = stats?.clients || 0;

                        return (
                            <button
                                key={t.key}
                                onClick={() => setActiveTab(t.key)}
                                className={cn(
                                    "px-5 py-2.5 text-sm font-bold transition-all duration-300 rounded-xl whitespace-nowrap outline-none flex items-center gap-2",
                                    isActive
                                        ? "bg-background text-primary shadow-lg shadow-black/5 ring-1 ring-border/20 translate-y-0"
                                        : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                                )}
                            >
                                {t.label}
                                {count > 0 && (
                                    <span className={cn(
                                        "text-[10px] px-1.5 py-0 h-5 min-w-[20px] inline-flex items-center justify-center rounded-full transition-colors",
                                        isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                                    )}>
                                        {count}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ─── Bottom Nav (Mobile only) ─── */}
            <BottomNav
                items={[
                    { id: 'users', label: 'Users', icon: Users },
                    { id: 'templates', label: 'Projects', icon: FolderKanban },
                    // { id: 'tasks', label: 'Tasks', icon: CheckSquare },
                    { id: 'clients', label: 'Clients', icon: Activity },
                    { id: 'reports', label: 'Reports', icon: BarChart3 },
                    { id: 'workload', label: 'Workload', icon: Activity },
                    { id: 'permissions', label: 'Permissions', icon: Shield },
                    { id: 'settings', label: 'Settings', icon: Settings },
                ]}
                activeId={activeTab}
                onTabChange={(id) => setActiveTab(id as Tab)}
            />

            {/* ─── Tab Content ─── */}
            {/* {activeTab === 'overview' && (
                <OverviewTab
                    role="admin"
                    stats={stats}
                    onAction={(id) => {
                        if (id === 'settings') setActiveTab('settings');
                        if (id === 'reports') setActiveTab('reports');
                        if (id === 'users') setActiveTab('users');
                        if (id === 'templates') setActiveTab('templates');
                        if (id === 'tasks') setActiveTab('tasks');
                        if (id === 'clients') setActiveTab('clients');
                        if (id === 'add-user') setIsAddUserOpen(true);
                        if (id === 'new-client') setIsAddClientOpen(true);
                    }}
                />
            )} */}

            {
                activeTab === 'performance' && (
                    <ControllerPerformance />
                )
            }

            {
                activeTab === 'workload' && (
                    <WorkloadManagementTab />
                )
            }

            {
                activeTab === 'users' && (
                    <UsersTab search={userSearch} setSearch={setUserSearch} />
                )
            }

            {/* ─── Projects ─── */}
            {
                activeTab === 'templates' && (
                    <ProjectsTab />
                )
            }

            {/* ─── Tasks currently not used ─── */}

            {
                activeTab === 'tasks' && (
                    <TasksTab />
                )
            }

            {/* ─── Clients ─── */}
            {
                activeTab === 'clients' && (
                    <ClientsTab />
                )
            }

            {/* ─── Settings ─── */}
            {
                activeTab === 'settings' && (
                    <CompanySettings />
                )
            }

            {/* Reports */}
            {
                activeTab === 'reports' && (
                    <ReportsTab />
                )
            }

            {
                activeTab === 'permissions' && (
                    <PermissionsTab />
                )
            }


            {/* Modals */}
            <AddUserModal open={isAddUserOpen} onOpenChange={setIsAddUserOpen} />
            <AddClientModal open={isAddClientOpen} onOpenChange={setIsAddClientOpen} />
        </div >
    );
}


