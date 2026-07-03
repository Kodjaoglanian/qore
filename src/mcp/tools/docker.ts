import type { ToolDef } from "../registry.js";
import {
  getContainers, startContainer, stopContainer, restartContainer, removeContainer,
  getContainerLogs, inspectContainer, pruneStoppedContainers, getDockerImages,
  getContainerStats, isDockerAvailable,
} from "../../core/probe/docker.js";
import { formatBytes } from "../../core/probe/system.js";

export const dockerTools: ToolDef[] = [
  {
    name: "docker_list",
    description: "List all Docker containers (running and stopped)",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const containers = await getContainers();
      if (containers.length === 0) return "No Docker containers found.";
      const lines = containers.map(c => `  ${c.name} (${c.id}) — ${c.state} — ${c.image} — ${c.status}`);
      return `Docker Containers (${containers.length}):\n${lines.join("\n")}`;
    },
  },
  {
    name: "docker_start",
    description: "Start a Docker container by name or ID",
    inputSchema: {
      type: "object",
      properties: { container: { type: "string", description: "Container name or ID" } },
      required: ["container"],
    },
    handler: async (args) => {
      const ok = await startContainer(args.container as string);
      return ok ? `Started container ${args.container}` : `Failed to start container ${args.container}`;
    },
  },
  {
    name: "docker_stop",
    description: "Stop a Docker container by name or ID",
    inputSchema: {
      type: "object",
      properties: { container: { type: "string", description: "Container name or ID" } },
      required: ["container"],
    },
    handler: async (args) => {
      const ok = await stopContainer(args.container as string);
      return ok ? `Stopped container ${args.container}` : `Failed to stop container ${args.container}`;
    },
  },
  {
    name: "docker_restart",
    description: "Restart a Docker container by name or ID",
    inputSchema: {
      type: "object",
      properties: { container: { type: "string", description: "Container name or ID" } },
      required: ["container"],
    },
    handler: async (args) => {
      const ok = await restartContainer(args.container as string);
      return ok ? `Restarted container ${args.container}` : `Failed to restart container ${args.container}`;
    },
  },
  {
    name: "docker_remove",
    description: "Remove a Docker container by name or ID",
    inputSchema: {
      type: "object",
      properties: { container: { type: "string", description: "Container name or ID" } },
      required: ["container"],
    },
    handler: async (args) => {
      const ok = await removeContainer(args.container as string);
      return ok ? `Removed container ${args.container}` : `Failed to remove container ${args.container}`;
    },
  },
  {
    name: "docker_logs",
    description: "Get Docker container logs",
    inputSchema: {
      type: "object",
      properties: {
        container: { type: "string", description: "Container name or ID" },
        lines: { type: "number", description: "Number of log lines (default 50)" },
      },
      required: ["container"],
    },
    handler: async (args) => {
      const logs = await getContainerLogs(args.container as string, (args.lines as number) ?? 50);
      return logs || "(no logs)";
    },
  },
  {
    name: "docker_inspect",
    description: "Inspect a Docker container (full JSON details)",
    inputSchema: {
      type: "object",
      properties: { container: { type: "string", description: "Container name or ID" } },
      required: ["container"],
    },
    handler: async (args) => {
      return await inspectContainer(args.container as string);
    },
  },
  {
    name: "docker_images",
    description: "List all Docker images",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const images = await getDockerImages();
      if (images.length === 0) return "No Docker images found.";
      const lines = images.map(img => `  ${img.tags.join(", ") || "<none>"} (${img.id}) — ${formatBytes(img.size)}`);
      return `Docker Images (${images.length}):\n${lines.join("\n")}`;
    },
  },
  {
    name: "docker_prune",
    description: "Prune all stopped Docker containers",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const count = await pruneStoppedContainers();
      return count > 0 ? `Pruned ${count} stopped containers.` : "Nothing to prune.";
    },
  },
  {
    name: "docker_stats",
    description: "Get resource stats for a Docker container (CPU, memory, network, I/O)",
    inputSchema: {
      type: "object",
      properties: { container: { type: "string", description: "Container name or ID" } },
      required: ["container"],
    },
    handler: async (args) => {
      const stats = await getContainerStats(args.container as string);
      if (!stats) return "Failed to get stats. Container may be stopped or Docker unavailable.";
      const lines = [
        `CPU:     ${stats.cpuPercent.toFixed(2)}%`,
        `Memory:  ${formatBytes(stats.memUsage)} / ${formatBytes(stats.memLimit)} (${stats.memPercent.toFixed(1)}%)`,
        `Network: ↓ ${formatBytes(stats.netInput)}  ↑ ${formatBytes(stats.netOutput)}`,
        `Block:   read ${formatBytes(stats.blockRead)}  write ${formatBytes(stats.blockWrite)}`,
        `PIDs:    ${stats.pids}`,
      ];
      return lines.join("\n");
    },
  },
  {
    name: "docker_status",
    description: "Check if Docker daemon is available",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const avail = await isDockerAvailable();
      return avail ? "Docker daemon is available." : "Docker daemon is not available.";
    },
  },
];
