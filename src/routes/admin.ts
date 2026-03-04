import { Router } from "express";
import { verifyToken } from "../middleware/auth";
import { checkAdmin } from "../middleware/roles";

const router = Router();

router.use(verifyToken); // must be logged in
router.use(checkAdmin);  // must be admin

router.get("/", (req, res) => {
    res.json({ message: "Admin access granted" });
});

export default router;