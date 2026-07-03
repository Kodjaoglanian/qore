import type { ToolDef } from "../registry.js";
import { Orchestrator } from "../../core/orchestrator.js";

const orchestrator = new Orchestrator();

export const discoverTools: ToolDef[] = [
  {
    name: "discover_ports",
    description: "Scan and list all open network ports on the local machine",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: async () => {
      const probe = await orchestrator.runProbe();
      if (probe.ports.length === 0) return "No open ports found.";
      const lines = probe.ports.map(p =>
        `  ${p.port}/${p.protocol} — ${p.service} (PID ${p.pid ?? "unknown"})`
      );
      return `Open Ports (${probe.ports.length}):\n${lines.join("\n")}`;
    },
  },
  {
    name: "discover_containers",
    description: "List all Docker containers (running and stopped)",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: async () => {
      const probe = await orchestrator.runProbe();
      if (probe.containers.length === 0) return "No Docker containers found.";
      const lines = probe.containers.map(c =>
        `  ${c.name} (${c.id}) — ${c.state} — ${c.image}`
      );
      return `Docker Containers (${probe.containers.length}):\n${lines.join("\n")}`;
    },
  },
  {
    name: "discover_daemons",
    description: "List running daemon processes (pm2, systemd)",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: async () => {
      const probe = await orchestrator.runProbe();
      if (probe.daemons.length === 0) return "No daemons found.";
      const lines = probe.daemons.map(d =>
        `  ${d.name} (PID ${d.pid}) — ${d.status} — ${d.manager}`
      );
      return `Daemons (${probe.daemons.length}):\n${lines.join("\n")}`;
    },
  },
  {
    name: "discover_system_info",
    description: "Get local system information (hostname, OS, CPU, memory, disks)",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: async () => {
      const probe = await orchestrator.runProbe();
      const h = probe.hostInfo;
      if (!h) return "System info unavailable.";
      const lines = [
        `Host: ${h.hostname}`,
        `OS: ${h.os}`,
        `Kernel: ${h.kernel}`,
        `Uptime: ${h.uptime}`,
        `CPU: ${h.cpuCores} cores — ${h.cpuModel}`,
        `Memory: ${h.memoryUsed}/${h.memoryTotal} bytes`,
        `Swap: ${h.swapUsed}/${h.swapTotal} bytes`,
        `Load: ${h.loadAvg.map(l => l.toFixed(2)).join(" ")}`,
      ];
      if (h.disks.length > 0) {
        lines.push(`Disks:`);
        for (const d of h.disks) {
          lines.push(`  ${d.mount} — ${d.size} (${d.usePercent} used)`);
        }
      }
      return lines.join("\n");
    },
  },
  {
    name: "discover_network",
    description: "Get network interfaces, routes, and firewall rules",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: async () => {
      const probe = await orchestrator.runProbe();
      const lines: string[] = [];

      lines.push(`Network Interfaces (${probe.networkInterfaces.length}):`);
      for (const iface of probe.networkInterfaces) {
        lines.push(`  ${iface.name} — ${iface.state} — ${iface.ipv4.join(", ") || "no IPv4"}`);
      }

      lines.push(`\nRoutes (${probe.routes.length}):`);
      for (const r of probe.routes.slice(0, 20)) {
        lines.push(`  ${r.destination} via ${r.gateway} on ${r.interface}`);
      }

      lines.push(`\nFirewall Rules (${probe.firewallRules.length}):`);
      for (const f of probe.firewallRules.slice(0, 20)) {
        lines.push(`  ${f.chain} ${f.target} ${f.protocol} ${f.source} → ${f.destination}`);
      }

      return lines.join("\n");
    },
  },
  {
    name: "discover_processes",
    description: "List top processes by CPU usage",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: async () => {
      const probe = await orchestrator.runProbe();
      if (probe.processes.length === 0) return "No processes found.";
      const lines = probe.processes.map(p =>
        `  PID ${p.pid} — ${p.user} — CPU ${p.cpu.toFixed(1)}% MEM ${p.mem.toFixed(1)}% — ${p.command}`
      );
      return `Top Processes (${probe.processes.length}):\n${lines.join("\n")}`;
    },
  },
  {
    name: "discover_services",
    description: "List systemd services and their states",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: async () => {
      const probe = await orchestrator.runProbe();
      if (probe.services.length === 0) return "No services found (systemd required).";
      const lines = probe.services.slice(0, 30).map(s =>
        `  ${s.name} — ${s.activeState}/${s.subState} — ${s.description}`
      );
      return `Services (${probe.services.length}, showing first 30):\n${lines.join("\n")}`;
    },
  },
];
