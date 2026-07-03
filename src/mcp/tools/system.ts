import type { ToolDef } from "../registry.js";
import { getTopProcesses, killProcess } from "../../core/probe/processes.js";
import { getServices, controlService } from "../../core/probe/services.js";
import { getHostInfo } from "../../core/probe/system.js";
import { getNetworkInterfaces, getRoutes, getFirewallRules } from "../../core/probe/network-info.js";
import { formatBytes } from "../../core/probe/system.js";

export const systemTools: ToolDef[] = [
  {
    name: "sys_processes",
    description: "List top processes by CPU usage on the local machine",
    inputSchema: {
      type: "object",
      properties: {
        count: { type: "number", description: "Number of processes to return (default 20)" },
      },
    },
    handler: async (args) => {
      const procs = await getTopProcesses((args.count as number) ?? 20);
      if (procs.length === 0) return "No processes found.";
      const lines = procs.map(p =>
        `  PID ${p.pid} — ${p.user} — CPU ${p.cpu.toFixed(1)}% MEM ${p.mem.toFixed(1)}% — ${p.command}`
      );
      return `Top Processes (${procs.length}):\n${lines.join("\n")}`;
    },
  },
  {
    name: "sys_kill_process",
    description: "Kill a process by PID",
    inputSchema: {
      type: "object",
      properties: {
        pid: { type: "number", description: "Process ID to kill" },
        signal: { type: "string", description: "Signal to send: TERM (default) or KILL" },
      },
      required: ["pid"],
    },
    handler: async (args) => {
      const signal = (args.signal as string) ?? "TERM";
      const ok = await killProcess(args.pid as number, signal === "KILL" ? "KILL" : "TERM");
      return ok ? `Sent SIG${signal} to PID ${args.pid}` : `Failed to kill PID ${args.pid}`;
    },
  },
  {
    name: "sys_services",
    description: "List systemd services and their states",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: async () => {
      const svcs = await getServices();
      if (svcs.length === 0) return "No services found (systemd required).";
      const lines = svcs.slice(0, 30).map(s =>
        `  ${s.name} — ${s.activeState}/${s.subState} — ${s.description}`
      );
      return `Services (${svcs.length}, showing first 30):\n${lines.join("\n")}`;
    },
  },
  {
    name: "sys_service_control",
    description: "Control a systemd service (start, stop, or restart)",
    inputSchema: {
      type: "object",
      properties: {
        service: { type: "string", description: "Service name" },
        action: { type: "string", description: "Action: start, stop, or restart", enum: ["start", "stop", "restart"] },
      },
      required: ["service", "action"],
    },
    handler: async (args) => {
      const ok = await controlService(args.service as string, args.action as "start" | "stop" | "restart");
      return ok ? `${args.action}ed service ${args.service}` : `Failed to ${args.action} service ${args.service}`;
    },
  },
  {
    name: "sys_disk_usage",
    description: "Get disk usage information for the local machine",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: async () => {
      const host = await getHostInfo();
      if (!host || host.disks.length === 0) return "Disk info unavailable.";
      const lines = host.disks.map(d =>
        `  ${d.mount} — ${d.size} (${d.usePercent} used) — ${d.filesystem}`
      );
      return `Disk Usage:\n${lines.join("\n")}`;
    },
  },
  {
    name: "sys_memory",
    description: "Get memory and swap information for the local machine",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: async () => {
      const host = await getHostInfo();
      if (!host) return "Memory info unavailable.";
      const lines = [
        `Memory: ${formatBytes(host.memoryUsed)} / ${formatBytes(host.memoryTotal)} used`,
        `Swap:   ${formatBytes(host.swapUsed)} / ${formatBytes(host.swapTotal)} used`,
        `CPU:    ${host.cpuCores} cores — ${host.cpuModel}`,
        `Load:   ${host.loadAvg.map(l => l.toFixed(2)).join(" ")}`,
        `Uptime: ${host.uptime}`,
      ];
      return lines.join("\n");
    },
  },
  {
    name: "sys_network_info",
    description: "Get network interfaces, routes, and firewall rules for the local machine",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: async () => {
      const [interfaces, routes, firewall] = await Promise.all([
        getNetworkInterfaces().catch(() => []),
        getRoutes().catch(() => []),
        getFirewallRules().catch(() => []),
      ]);
      const lines: string[] = [];

      lines.push(`Network Interfaces (${interfaces.length}):`);
      for (const iface of interfaces) {
        lines.push(`  ${iface.name} — ${iface.state} — ${iface.ipv4.join(", ") || "no IPv4"}`);
      }

      lines.push(`\nRoutes (${routes.length}):`);
      for (const r of routes.slice(0, 20)) {
        lines.push(`  ${r.destination} via ${r.gateway} on ${r.interface}`);
      }

      lines.push(`\nFirewall Rules (${firewall.length}):`);
      for (const f of firewall.slice(0, 20)) {
        lines.push(`  ${f.chain} ${f.target} ${f.protocol} ${f.source} → ${f.destination}`);
      }

      return lines.join("\n");
    },
  },
];
