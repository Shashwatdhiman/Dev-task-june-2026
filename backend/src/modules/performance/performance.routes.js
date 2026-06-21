import { Hono } from "hono";
import { getTeamPerformance, getMemberTasks, getWorkloadData, getRejectionSummary, getMemberRejections, getTaskRejectionDetails, getWorkloadSummary, getWorkloadMemberDetail } from "./performance.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";

const router = new Hono();

router.get("/team", authenticate, getTeamPerformance);
router.get("/member/:userId", authenticate, getMemberTasks);
router.get("/workload", authenticate, getWorkloadData);
router.get("/rejections/summary", authenticate, getRejectionSummary);
router.get("/member/:userId/rejections", authenticate, getMemberRejections);
router.get("/task/:taskId/rejection-details", authenticate, getTaskRejectionDetails);

// Workload Management Module endpoints
router.get("/workload-summary", authenticate, getWorkloadSummary);
router.get("/workload-member/:userId", authenticate, getWorkloadMemberDetail);

export default router;
