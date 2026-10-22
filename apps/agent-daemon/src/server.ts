import { createDaemonServer } from "@cobot/agent-daemon-server";

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

const server = await createDaemonServer({ port: PORT });
await server.start();
