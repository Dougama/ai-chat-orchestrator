import express, { Request, Response } from "express";
import chatRoutes from "./api/routes/chatRoutes";
import cors from "cors";

interface ProcessEnv {
  PORT?: string;
}

const app = express();
const PORT = (process.env as ProcessEnv).PORT || 8080;
app.use(cors());
app.use(express.json());

app.get("/health", (req: Request, res: Response) => {
  res.status(200).json({ status: "ok", timestamp: new Date() });
});

app.use("/chat", chatRoutes);

app.listen(PORT, () => {
  console.log(`Orchestrator API (TS) listening on port ${PORT}`);
});
