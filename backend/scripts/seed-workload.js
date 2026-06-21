/**
 * seed-workload.js — Dummy LIVE data for the Workload Management feature.
 *
 * Creates a live instance, a team of worker members, and a realistic spread of
 * tasks + submissions for ONE working day so the Workload Management screen has
 * real numbers to show (occupancy, assigned/remaining/completed, late & overdue,
 * smart-status, and a rejection-with-reason).
 *
 * Scenarios it produces (for the target day):
 *   • Priya  (copywriter)     — OVERLOADED  (~137% of an 8h day), incl. a late-completed and a rejected task
 *   • Rahul  (designer)       — ON TIME     (~75%)
 *   • Sara   (reviewer)       — AHEAD        (~25%)
 *   • Amit   (email marketer) — DELAYED      (an incomplete task already past its due time)
 *   • member@example.com      — manual tasks (is_manual = true) mixed with instance tasks
 *
 * PREREQUISITES
 *   1. schema.sql already run on your Supabase project.
 *   2. scripts/seed.js already run (creates the company + base accounts).  This
 *      script reuses that company; if none exists it creates "Acme Workspace".
 *   3. .dev.vars filled with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 *
 * RUN
 *   node scripts/seed-workload.js            # targets today (IST)
 *   node scripts/seed-workload.js 2026-06-22 # targets a specific working day
 *
 * Re-runnable: it cleans up its own previously-seeded rows (tagged WL_SEED) first.
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".dev.vars" });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const TAG = "WL_SEED";
const INSTANCE_NAME = "Workload Demo — Spring Launch";
const PASSWORD = "Password123!";

const pad = (n) => String(n).padStart(2, "0");
const istToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const TARGET = process.argv[2] || istToday();
// ISO timestamp for HH:MM IST on the target day
const at = (h, m = 0) => new Date(`${TARGET}T${pad(h)}:${pad(m)}:00+05:30`).toISOString();

async function ensureCompany() {
    let { data } = await supabase.from("companies").select("id, name").order("created_at", { ascending: true }).limit(1);
    let company = data && data[0];
    if (!company) {
        const ins = await supabase.from("companies").insert({ name: "Acme Workspace" }).select().single();
        if (ins.error) throw ins.error;
        company = ins.data;
        console.log("  • created company", company.name);
    } else {
        console.log("  • using company", company.name, `(${company.id})`);
    }
    // Ensure working hours so daily capacity = 480 min (8h) on weekdays
    await supabase.from("companies").update({
        work_start_time: "09:30", work_end_time: "18:30",
        working_days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    }).eq("id", company.id);
    return company.id;
}

async function ensureMember(companyId, email, name, workflow_role) {
    let userId;
    const created = await supabase.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (created.error) {
        // already exists — find it
        const list = await supabase.auth.admin.listUsers();
        const found = list.data?.users?.find((u) => u.email === email);
        if (!found) throw created.error;
        userId = found.id;
    } else {
        userId = created.data.user.id;
    }
    await supabase.from("users").upsert({
        id: userId, company_id: companyId, name,
        platform_role: "member", workflow_role, is_active: true,
    });
    return userId;
}

async function ensureProjectAndInstance(companyId, clientId) {
    let { data: projects } = await supabase.from("projects").select("id, name").eq("company_id", companyId).limit(1);
    let project = projects && projects[0];
    if (!project) {
        const ins = await supabase.from("projects").insert({ name: "Social Media — Monthly", company_id: companyId }).select().single();
        if (ins.error) throw ins.error;
        project = ins.data;
    }
    const ins = await supabase.from("instances").insert({
        project_id: project.id, client_id: clientId, name: INSTANCE_NAME,
        status: "ONGOING", company_id: companyId,
    }).select().single();
    if (ins.error) throw ins.error;
    return { projectId: project.id, instanceId: ins.data.id };
}

async function ensureClient(companyId) {
    let { data } = await supabase.from("clients").select("id").eq("company_id", companyId).limit(1);
    if (data && data[0]) return data[0].id;
    const ins = await supabase.from("clients").insert({ name: "Globex Foods", company_id: companyId }).select().single();
    return ins.error ? null : ins.data.id;
}

async function cleanup(companyId) {
    const { data: old } = await supabase.from("tasks").select("id").eq("company_id", companyId).like("description", `${TAG}%`);
    const ids = (old || []).map((t) => t.id);
    if (ids.length) {
        await supabase.from("task_performance_logs").delete().in("task_id", ids);
        await supabase.from("task_approval_history").delete().in("task_id", ids);
        await supabase.from("task_approval_levels").delete().in("task_id", ids);
        await supabase.from("tasks").delete().in("id", ids);
    }
    await supabase.from("instances").delete().eq("company_id", companyId).eq("name", INSTANCE_NAME);
    if (ids.length) console.log(`  • cleaned ${ids.length} previously-seeded tasks`);
}

async function insertTask(t) {
    const row = {
        company_id: t.company_id, project_id: t.project_id, instance_id: t.instance_id || null,
        title: t.title, description: TAG, status: t.status, due_date: t.due_date,
        assigned_user_id: t.assigned_user_id, assigned_role: t.assigned_role || "copywriter",
        estimated_minutes: t.estimated_minutes, turnaround_minutes: t.turnaround_minutes || t.estimated_minutes,
        total_working_minutes: t.total_working_minutes || 0, is_manual: !!t.is_manual,
        task_order: t.task_order || 1, approval_required: t.approval_required || false,
        assigned_at: t.assigned_at || at(9, 30), submitted_at: t.submitted_at || null, approved_at: t.approved_at || null,
        last_rejection_comment: t.last_rejection_comment || null, last_rejected_by: t.last_rejected_by || null,
        last_rejected_at: t.last_rejected_at || null,
    };
    const ins = await supabase.from("tasks").insert(row).select().single();
    if (ins.error) throw ins.error;
    const task = ins.data;

    if (["COMPLETED", "APPROVED"].includes(t.status)) {
        const late = (t.total_working_minutes || 0) > (t.estimated_minutes || 0);
        await supabase.from("task_performance_logs").insert({
            task_id: task.id, user_id: t.assigned_user_id, company_id: t.company_id,
            instance_name: t.instance_id ? INSTANCE_NAME : null, task_title: t.title,
            assigned_at: row.assigned_at, submitted_at: t.submitted_at, approved_at: t.approved_at,
            estimated_minutes: t.estimated_minutes, actual_working_minutes: t.total_working_minutes,
            status: late ? "Overdue" : "On-time", approver_comments: late ? "Approved (ran over estimate)" : "Approved",
        });
    }
    if (t.status === "REJECTED") {
        await supabase.from("task_approval_history").insert({
            task_id: task.id, level_number: 1, actor_id: t.last_rejected_by, company_id: t.company_id,
            action: "REJECTED", comment: t.last_rejection_comment,
        });
    }
    return task.id;
}

async function main() {
    console.log(`\nSeeding Workload demo data for target day: ${TARGET}\n`);
    const companyId = await ensureCompany();
    const clientId = await ensureClient(companyId);
    await cleanup(companyId);
    const { projectId, instanceId } = await ensureProjectAndInstance(companyId, clientId);

    console.log("  • creating team members…");
    const priya = await ensureMember(companyId, "workload.copywriter@example.com", "Priya Nair", "copywriter");
    const rahul = await ensureMember(companyId, "workload.designer@example.com", "Rahul Verma", "designer");
    const sara = await ensureMember(companyId, "workload.reviewer@example.com", "Sara Khan", "reviewer");
    const amit = await ensureMember(companyId, "workload.marketer@example.com", "Amit Joshi", "email_marketer");
    // reuse the base member account for the manual-task scenario, if present
    const { data: baseMembers } = await supabase.from("users").select("id").eq("company_id", companyId).eq("name", "Member User").limit(1);
    const baseMember = baseMembers && baseMembers[0] ? baseMembers[0].id : amit;

    const base = { company_id: companyId, project_id: projectId, instance_id: instanceId };
    const tasks = [
        // Priya — OVERLOADED (est total 660 → ~137%)
        { ...base, title: "Write launch email copy", assigned_user_id: priya, assigned_role: "copywriter", estimated_minutes: 120, status: "COMPLETED", total_working_minutes: 110, due_date: at(13, 0), assigned_at: at(9, 30), submitted_at: at(11, 10), approved_at: at(11, 40), task_order: 1 },
        { ...base, title: "Caption batch — Instagram", assigned_user_id: priya, assigned_role: "copywriter", estimated_minutes: 90, status: "COMPLETED", total_working_minutes: 150, due_date: at(12, 0), assigned_at: at(9, 30), submitted_at: at(13, 5), approved_at: at(13, 20), task_order: 2 },
        { ...base, title: "Blog draft — SEO", assigned_user_id: priya, assigned_role: "copywriter", estimated_minutes: 180, status: "IN_PROGRESS", due_date: at(18, 0), task_order: 3 },
        { ...base, title: "Ad copy variations", assigned_user_id: priya, assigned_role: "copywriter", estimated_minutes: 120, status: "PENDING_APPROVAL", approval_required: true, due_date: at(18, 30), submitted_at: at(15, 0), task_order: 4 },
        { ...base, title: "Promo graphic copy", assigned_user_id: priya, assigned_role: "copywriter", estimated_minutes: 60, status: "REJECTED", due_date: at(17, 0), last_rejection_comment: "Tone too formal — please redo in a friendlier voice.", last_rejected_by: sara, last_rejected_at: at(14, 30), task_order: 5 },
        { ...base, title: "Newsletter copy", assigned_user_id: priya, assigned_role: "copywriter", estimated_minutes: 90, status: "LOCKED", due_date: at(18, 30), task_order: 6 },

        // Rahul — ON TIME (360 → 75%)
        { ...base, title: "Design launch banner", assigned_user_id: rahul, assigned_role: "designer", estimated_minutes: 120, status: "COMPLETED", total_working_minutes: 130, due_date: at(13, 0), assigned_at: at(9, 30), submitted_at: at(12, 30), approved_at: at(12, 50), task_order: 1 },
        { ...base, title: "Instagram carousel design", assigned_user_id: rahul, assigned_role: "designer", estimated_minutes: 120, status: "IN_PROGRESS", due_date: at(18, 0), task_order: 2 },
        { ...base, title: "Email header graphic", assigned_user_id: rahul, assigned_role: "designer", estimated_minutes: 120, status: "LOCKED", due_date: at(18, 30), task_order: 3 },

        // Sara — AHEAD (120 → 25%)
        { ...base, title: "QA — launch email", assigned_user_id: sara, assigned_role: "reviewer", estimated_minutes: 60, status: "COMPLETED", total_working_minutes: 45, due_date: at(14, 0), assigned_at: at(11, 0), submitted_at: at(13, 0), approved_at: at(13, 10), task_order: 1 },
        { ...base, title: "QA — carousel design", assigned_user_id: sara, assigned_role: "reviewer", estimated_minutes: 60, status: "IN_PROGRESS", due_date: at(18, 0), task_order: 2 },

        // Amit — DELAYED (incomplete task already past its due time earlier today)
        { ...base, title: "Schedule campaign in ESP", assigned_user_id: amit, assigned_role: "email_marketer", estimated_minutes: 60, status: "IN_PROGRESS", due_date: at(11, 0), task_order: 1 },
        { ...base, title: "Pull weekly report", assigned_user_id: amit, assigned_role: "email_marketer", estimated_minutes: 60, status: "LOCKED", due_date: at(18, 30), task_order: 2 },

        // Base member — MANUAL tasks (is_manual) mixed in
        { company_id: companyId, project_id: projectId, instance_id: null, is_manual: true, title: "Client call notes", assigned_user_id: baseMember, assigned_role: "member", estimated_minutes: 30, status: "COMPLETED", total_working_minutes: 35, due_date: at(12, 0), assigned_at: at(10, 0), submitted_at: at(11, 30), approved_at: at(11, 35), task_order: 1 },
        { company_id: companyId, project_id: projectId, instance_id: null, is_manual: true, title: "Update delivery tracker", assigned_user_id: baseMember, assigned_role: "member", estimated_minutes: 45, status: "IN_PROGRESS", due_date: at(18, 0), task_order: 2 },
    ];

    let count = 0;
    for (const t of tasks) { await insertTask(t); count++; }
    console.log(`  • inserted ${count} tasks (instance + manual), with submissions & 1 rejection`);

    console.log(`\nDone. Open Workload Management as a Controller/Admin and view date ${TARGET}.`);
    console.log("Expected: Priya ~137% (overloaded), Rahul ~75%, Sara ~25% (ahead), Amit delayed (overdue task).\n");
}

main().catch((e) => { console.error("Seed failed:", e.message || e); process.exit(1); });