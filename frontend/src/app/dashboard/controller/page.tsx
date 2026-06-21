'use client';

import React, { useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
import { useAuthStore } from '@/lib/zustand/user/user';
import { useUserStore } from '@/lib/zustand/user/addUser';
import { useProjectStore } from '@/lib/zustand/projects/createproject';
import { useTaskStore } from '@/lib/zustand/tasks/tasks';
import { useRouter, useSearchParams } from 'next/navigation';
import { AccessControlProvider } from '@/lib/contexts/access-control-context';
import {

    User as UserIcon,
    Loader2, LogOut,
    Info,
} from 'lucide-react';
import { Button, Badge, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, Card } from '@/components/ui';
import { AddUserModal } from '@/components/user/add-user-modal';
import { AddProjectModal } from '@/components/projects/add-project-modal';
import { AddClientModal } from '@/components/clients/add-client-modal';
import { CreateInstanceModal } from '@/components/instances/create-instance-modal';
import { useInstanceStore } from '@/lib/zustand/instances/instances';
import { useToast } from '@/components/ui/toast';
import { useClientStore } from '@/lib/zustand/clients/client';
import { StatsCard } from '@/components/shared-components/stats-card';
import ClientsTab from '@/components/clients/clients_tab';
import TasksTab from '@/components/task/task-tab';
import UsersTab from '@/components/user/user-tab';
import InstancesTab from '@/components/instances/instances-tab';
import { NotificationBell } from '@/components/notifications/notification-bell';
import OverdueTasks from '@/components/task/overdue-tasks';
import { useStatsStore } from '@/lib/zustand/stats/dashboard-stats';
import CompanySettings from '@/components/holiday/holiday';
import BottomNav from '@/components/dashboard/bottom-nav';
import { cn } from '@/lib/utils';
import OverviewTab from '@/components/dashboard/overview-tab';
import { UpdatePrompt } from '@/components/ui/update-prompt';
import ClientApprovalsTab from '@/components/client-approvals/client-approvals-tab';
import { useClientApprovalStore } from '@/lib/zustand/client-approvals/client-approvals';
import RejectionAnalyticsTab from '@/components/MemberTaskModal/rejection-analytics-tab';
import SLAExtensionRequestsTab from '@/components/sla-extension/sla-extension-requests-tab';
import WorkloadManagementTab from '@/components/workload/WorkloadManagementTab';
import { useSLAExtensionStore } from '@/lib/zustand/sla-extension/sla-extension';
type Tab = 'overview' | 'users' | 'projects' | 'tasks' | 'clients' | 'permissions' | 'reports' | 'settings' | 'instances' | 'overdue' | 'client-approvals' | 'rejections' | 'sla-requests' | 'workload';

import {
    Users, FolderKanban, CheckSquare, Activity,
    UserPlus, Briefcase, BarChart3, Settings,
    Shield, Zap, Server, ArrowRight, ExternalLink,
    Play, Clock, CheckCircle2, AlertCircle, HelpCircle, MessageSquare, AlertTriangle
} from 'lucide-react';
import { HowToModal } from '@/components/how-to/how-to-modal';
import { useNotificationStore } from '@/lib/zustand/notifications/notifications';
export default function ControllerDashboard() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const activeTab = (searchParams.get('tab') as Tab) || 'instances';
    const { user, isAuthenticated } = useAuthStore();
    const { addToast } = useToast();
    const [userSearch, setUserSearch] = useState('');
    const [isAddUserOpen, setIsAddUserOpen] = useState(false);
    const [isAddProjectOpen, setIsAddProjectOpen] = useState(false);
    const [isAddClientOpen, setIsAddClientOpen] = useState(false);
    const [isNewInstanceOpen, setIsNewInstanceOpen] = useState(false);
    const [isHowToOpen, setIsHowToOpen] = useState(false);
    const { instances, instancesCount, fetchInstances } = useInstanceStore();

    const { clients, clientsCount, clientsloading, clientserror } = useClientStore();

    const { stats, fetchStats, statsLoading } = useStatsStore();
    const { requests, fetchRequests } = useSLAExtensionStore();

    // State for rejection count
    const [rejectionCount, setRejectionCount] = useState(0);
    const [slaRequestCount, setSlaRequestCount] = useState(0);
    const { subscribeRealtime } = useNotificationStore();

    // Fetch rejection count and SLA requests
    useEffect(() => {
        const fetchRejectionCount = async () => {
            try {
                const { data } = await api.get('/performance/rejections/summary');
                const total = (data.data || []).reduce((sum: number, m: any) => sum + m.total_rejection_events, 0);
                setRejectionCount(total);
            } catch (err) {
                console.error('Failed to fetch rejection count:', err);
            }
        };
        fetchRejectionCount();

        // Fetch SLA extension requests count
        const fetchSLACount = async () => {
            try {
                await fetchRequests({ status: 'PENDING' });
                const pendingCount = useSLAExtensionStore.getState().requestsCount;
                setSlaRequestCount(pendingCount);
            } catch (err) {
                console.error('Failed to fetch SLA request count:', err);
            }
        };
        fetchSLACount();

        // Listen for realtime notifications to refresh SLA count
        if (user?.id) {
            const unsub = subscribeRealtime(user.id, (notification: any) => {
                if (notification.type === 'sla_extension_requested') {
                    fetchSLACount();
                }
            });
            return () => unsub();
        }
    }, [user?.id, fetchRequests, subscribeRealtime]);


    // Fetch lightweight stats on mount
    useEffect(() => {
        fetchStats();
    }, []);

    // Lazy load full data based on active tab
    useEffect(() => {
        switch (activeTab) {
            case 'instances':
                // InstancesTab component handles its own fetching on mount with correct filters
                break;
        }
    }, [activeTab]);

    const handleSoftRefresh = async () => {
        fetchStats();

        // Refresh rejection count
        try {
            const { data } = await api.get('/performance/rejections/summary');
            const total = (data.data || []).reduce((sum: number, m: any) => sum + m.total_rejection_events, 0);
            setRejectionCount(total);
        } catch (err) {
            console.error('Failed to refresh rejection count:', err);
        }

        switch (activeTab) {
            case 'instances':
                fetchInstances();
                break;
            // case 'tasks':
            //     useTaskStore.getState().fetchTasks();
            //     break;
            case 'users':
                useUserStore.getState().fetchUsers();
                break;
            case 'clients':
                useClientStore.getState().fetchClients();
                break;
            case 'overdue':
                useStatsStore.getState().fetchStats();
                break;
            case 'client-approvals':
                useClientApprovalStore.getState().fetchApprovals('PENDING');
                break;
            case 'sla-requests':
                fetchRequests({ status: 'PENDING' });
                break;
        }
    };

    return (
        <AccessControlProvider>
            <div className="min-h-screen bg-background p-4 sm:p-6 pb-32 md:pb-6 relative">
                <UpdatePrompt onRefresh={handleSoftRefresh} />

                {/* ─── Header ─── */}
                <div className="mb-6">
                    <div className="flex items-start justify-between gap-3">
                        {/* Left: Title block */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <h1 className="text-xl sm:text-2xl font-bold text-foreground">
                                    {user?.platform_role === 'controller' ? 'Process Controller Dashboard' : 'Process Interim Manager Dashboard'}
                                </h1>
                                <span className="px-2 py-0.5 rounded text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                                    System Control
                                </span>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                Manage workflow instances and monitor progress
                            </p>
                        </div>

                        {/* Right: Desktop layout */}
                        <div className="hidden md:flex items-center gap-3 shrink-0">
                            <Badge variant="outline" className="text-xs px-3 py-1">{user?.workflow_role === 'interim_manager' ? 'Interim Manager' : 'Controller'}</Badge>
                            <div className="flex items-center gap-2">
                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold">
                                    {user?.name?.slice(0, 1).toUpperCase() || 'A'}
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setIsHowToOpen(true)}
                                    className="h-8 w-8 p-0 rounded-full hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                                >
                                    <HelpCircle className="h-5 w-5" />
                                </Button>
                                <NotificationBell />
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




                        {/* Mobile dropdown removed — NotificationBell lives only in the desktop header above */}
                    </div>
                </div>

                {/* Removed Top Stats Grid */}

                {/* ─── Tab Bar (Desktop - Pill Design) ─── */}
                {/* <div className="hidden md:block mb-8 mt-2 top-[72px] z-30 bg-background/50 backdrop-blur-sm -mx-2 px-2 py-2">
                <div className="p-1 bg-muted/40 rounded-2xl border border-border/40 inline-flex items-center gap-1">
                    {tabs.map((t) => {
                        const isActive = activeTab === t.key;
                        let count = 0;
                        if (t.key === 'instances') count = instancesCount || 0;                                                 
                        if (t.key === 'clients') count = clientsCount || 0;
                        if (t.key === 'tasks') count = stats?.activeTasks || 0;
                        if (t.key === 'overdue') count = stats?.overdueTasks || 0;

                        return (
                            <button
                                key={t.key}
                                onClick={() => setActiveTab(t.key)}
                                className={cn(
                                    "px-5 py-2.5 text-sm font-bold transition-all duration-300 rounded-xl whitespace-nowrap outline-none flex items-center gap-2",
                                    isActive
                                        ? "bg-background text-primary shadow-lg shadow-black/5 ring-1 ring-border/20"
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
            </div> */}

                {/* Removed Bottom Nav */}

                {/* ─── Tab Content ─── */}
                {
                    activeTab === 'overview' && (
                        <OverviewTab
                            role="controller"
                            stats={stats}
                            onAction={(id) => {
                                if (id === 'settings') router.push('/dashboard/controller?tab=settings');
                                if (id === 'reports') router.push('/dashboard/controller?tab=reports');
                                if (id === 'new-client') setIsAddClientOpen(true);
                                if (id === 'add-user') setIsAddUserOpen(true);
                                if (id === 'users') router.push('/dashboard/controller?tab=users');
                                if (id === 'tasks') router.push('/dashboard/controller?tab=tasks');
                                if (id === 'templates') router.push('/dashboard/controller?tab=instances'); // Mapping templates category to instances
                            }}
                        />
                    )
                }

                {
                    activeTab === 'users' && (
                        <UsersTab
                            search={userSearch}
                            setSearch={setUserSearch}
                        />
                    )
                }


                {
                    activeTab === 'tasks' && (
                        <TasksTab
                        />
                    )
                }

                {
                    activeTab === 'instances' && (
                        <InstancesTab
                            onNewInstance={() => setIsNewInstanceOpen(true)}
                        />
                    )
                }

                {/* clients tab */}
                {
                    activeTab === 'clients' && (
                        <ClientsTab />
                    )
                }

                {/* overdue tasks tab */}
                {
                    activeTab === 'overdue' && (
                        <OverdueTasks />
                    )
                }

                {/* client approvals tab */}
                {
                    activeTab === 'client-approvals' && (
                        <ClientApprovalsTab />
                    )
                }

                {/* rejections tab */}
                {
                    activeTab === 'rejections' && (
                        <RejectionAnalyticsTab />
                    )
                }

                {/* SLA extension requests tab */}
                {
                    activeTab === 'sla-requests' && (
                        <SLAExtensionRequestsTab />
                    )
                }

                {/* Workload Management tab */}
                {
                    activeTab === 'workload' && (
                        <WorkloadManagementTab />
                    )
                }

                {
                    activeTab === 'settings' && (
                        <CompanySettings />
                    )
                }

                {/* Modals */}
                <AddUserModal open={isAddUserOpen} onOpenChange={setIsAddUserOpen} />
                <AddProjectModal open={isAddProjectOpen} onOpenChange={setIsAddProjectOpen} />
                <AddClientModal open={isAddClientOpen} onOpenChange={setIsAddClientOpen} />
                <CreateInstanceModal open={isNewInstanceOpen} onOpenChange={setIsNewInstanceOpen} />
                <HowToModal open={isHowToOpen} onOpenChange={setIsHowToOpen} />
            </div>
        </AccessControlProvider>
    );
}

