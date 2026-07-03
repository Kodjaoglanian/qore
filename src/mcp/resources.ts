import { VaultClient } from "./vault-client.js";
import { Orchestrator } from "../core/orchestrator.js";
import { getContainers, getDockerImages } from "../core/probe/docker.js";
import { getHostInfo, formatBytes } from "../core/probe/system.js";

const vaultClient = new VaultClient();
const orchestrator = new Orchestrator();

export interface ResourceDef {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  read: () => Promise<string>;
}

export async function listResources(): Promise<Array<{
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}>> {
  const defs = await getResourceDefs();
  return defs.map(d => ({ uri: d.uri, name: d.name, description: d.description, mimeType: d.mimeType }));
}

export async function readResource(uri: string): Promise<string> {
  const defs = await getResourceDefs();
  const def = defs.find(d => d.uri === uri);
  if (!def) throw new Error(`Resource not found: ${uri}`);
  return def.read();
}

async function getResourceDefs(): Promise<ResourceDef[]> {
  return [
    {
      uri: "qore://connections",
      name: "Connections",
      description: "List all saved connections (metadata only, no secrets)",
      mimeType: "application/json",
      read: async () => {
        const resp = await vaultClient.listConnections();
        if ("error" in resp) return JSON.stringify({ error: resp.error });
        return JSON.stringify(resp.connections, null, 2);
      },
    },
    {
      uri: "qore://probe/latest",
      name: "Latest Probe",
      description: "Latest infrastructure probe snapshot",
      mimeType: "application/json",
      read: async () => {
        const probe = await orchestrator.runProbe();
        return JSON.stringify({
          timestamp: probe.timestamp,
          ports: probe.ports.length,
          containers: probe.containers.length,
          images: probe.dockerImages.length,
          daemons: probe.daemons.length,
          processes: probe.processes.length,
          services: probe.services.length,
        }, null, 2);
      },
    },
    {
      uri: "qore://docker/containers",
      name: "Docker Containers",
      description: "Current Docker container list",
      mimeType: "application/json",
      read: async () => {
        const containers = await getContainers();
        return JSON.stringify(containers, null, 2);
      },
    },
    {
      uri: "qore://docker/images",
      name: "Docker Images",
      description: "Current Docker image list",
      mimeType: "application/json",
      read: async () => {
        const images = await getDockerImages();
        return JSON.stringify(images, null, 2);
      },
    },
    {
      uri: "qore://system/info",
      name: "System Info",
      description: "Current system information (hostname, OS, CPU, memory, disks)",
      mimeType: "application/json",
      read: async () => {
        const host = await getHostInfo();
        if (!host) return JSON.stringify({ error: "unavailable" });
        return JSON.stringify({
          hostname: host.hostname,
          os: host.os,
          kernel: host.kernel,
          uptime: host.uptime,
          cpuCores: host.cpuCores,
          cpuModel: host.cpuModel,
          memoryUsed: formatBytes(host.memoryUsed),
          memoryTotal: formatBytes(host.memoryTotal),
          loadAvg: host.loadAvg,
          disks: host.disks,
        }, null, 2);
      },
    },
  ];
}
