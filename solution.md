# SOLUTION.md

# FMS Developer Assignment Solution

**Candidate:** Shashwat Dhiman

---

# Overview

This submission implements both tasks from the assignment:

### Task 1

Refactor the dashboard navigation by moving dashboard tabs (Active Instances, Team Members, etc.) into the sidebar navigation.

### Task 2

Implement the Workload Management module for Controllers and Admins, providing daily workload visibility, occupancy calculations, and per-member task insights.

The implementation follows the existing architecture and reuses existing modules and utilities wherever possible.

---

# Environment Setup

## Database

Created a Supabase project and executed:

```bash
backend/schema.sql
```

## Backend

```bash
cd backend
npm install
```

Configured:

* SUPABASE_URL
* SUPABASE_SERVICE_ROLE_KEY

Started backend:

```bash
npm run dev
```

---

## Seed Data

Created sample accounts:

```bash
node scripts/seed.js
```

Generated workload demo data:

```bash
node scripts/seed-workload.js
```

---

## Frontend

```bash
cd frontend
npm install
```

Configured:

* NEXT_PUBLIC_API_URL
* NEXT_PUBLIC_SUPABASE_URL
* NEXT_PUBLIC_SUPABASE_ANON_KEY

Started frontend:

```bash
npm run dev
```

---

# Task 1 – Dashboard Navigation Refactor

## Objective

Move dashboard sections from the top tab bar into the sidebar navigation.

## Changes Made

### Sidebar

Updated:

```text
frontend/src/components/shared-components/sidebar/sidebar.tsx
```

Added navigation entries for dashboard sections previously accessible through tabs.

### Controller Dashboard

Updated:

```text
frontend/src/app/dashboard/controller/page.tsx
```

Removed dependency on top-level tabs and integrated navigation with the sidebar.

### Admin Dashboard

Updated:

```text
frontend/src/app/dashboard/admin/page.tsx
```

Applied the same navigation pattern for consistency.

### Styling

Updated:

```text
frontend/src/components/shared-components/sidebar/sidebar.module.css
```

to support the new sidebar layout.

## Result

Dashboard sections such as:

* Active Instances
* Team Members
* Performance
* Workload Management

are now accessible directly from the sidebar, creating a cleaner and more scalable navigation experience.

---

# Task 2 – Workload Management Module

## Objective

Provide Process Controllers and Administrators with visibility into team workload and daily capacity.

---

## Backend Implementation

Updated:

```text
backend/src/modules/performance/performance.controller.js
backend/src/modules/performance/performance.routes.js
```

Implemented:

### Workload Summary Endpoint

Returns:

* Daily capacity
* Assigned workload
* Remaining workload
* Completed workload
* Occupancy percentage
* Smart status
* Team summary metrics

### Member Detail Endpoint

Returns:

* Task list for the selected day
* Completion history
* Allocated vs actual effort
* Daily totals

---

## Reused Existing Working Hours Engine

Reused:

```text
src/utils/businessCalendar.js
```

for:

* Working hours
* Lunch break calculations
* Holiday handling
* Weekend detection
* Remaining capacity calculations

No duplicate calendar logic was introduced.

---

## Workload Metrics Implemented

### Assigned Today

Sum of estimated effort for all tasks due on the selected day.

Includes:

* Workflow tasks
* Manual tasks

### Completed

Tracks:

* Allocated effort
* Actual effort

### Remaining

Tracks incomplete tasks:

* LOCKED
* IN_PROGRESS
* REJECTED
* PENDING_APPROVAL

### Occupancy %

Calculated as:

```text
assignedToday / dailyCapacity × 100
```

Supports overload situations (>100%).

### Smart Status

Implemented:

* NO_LOAD
* AHEAD
* ON_TIME
* BEHIND
* DELAYED

---

# Frontend Implementation

Created:

```text
frontend/src/components/workload/WorkloadManagementTab.tsx
frontend/src/lib/api/workload.ts
```

---

## Sidebar Integration

Added Workload Management navigation for:

* Controller
* Admin
* Interim Manager

The member dashboard intentionally does not expose workload information.

---

## Team Overview

Displays:

* Occupancy percentage
* Assigned workload
* Remaining workload
* Completed workload
* Status chip
* Occupancy bar

Summary cards display:

* Total members
* Average occupancy
* Overloaded members
* Delayed members

---

## Member Detail View

Clicking a member opens a detailed view showing:

### Today's Task List

* Task title
* Status
* Estimated effort
* Due date

### Completion History

* Allocated effort
* Actual effort
* Variance

---

# Verification

Verified:

✓ Controller dashboard can access Workload Management.

✓ Admin dashboard can access Workload Management.

✓ Member dashboard has no workload visibility.

✓ Occupancy values correctly exceed 100% for overloaded members.

✓ Completed + Remaining = Assigned.

✓ Weekend and holiday capacity handling works correctly.

✓ Member detail view displays task history and completion history.

✓ All queries are scoped by company_id.

---

# Future Improvements

Possible extensions include:

* Weekly workload forecasting.
* Advanced filtering and search.
* Approval workload tracking.
* Team capacity analytics.
* Intelligent workload rebalancing suggestions.

---

# Notes

No API keys or secrets have been committed to the repository.

The implementation focuses on extending the existing codebase while preserving architecture, reusing utilities, and minimizing duplication.
