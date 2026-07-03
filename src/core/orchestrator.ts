import type { ProbeResult, HostInfo, NetworkInterface, RouteInfo, FirewallRule, DockerImage } from "./types.js";
import { scanPorts } from "./probe/network.js";
import { getContainers, getDockerInfo, getDockerImages, isDockerAvailable } from "./probe/docker.js";
import { scanDaemons } from "./probe/daemon.js";
import { getHostInfo } from "./probe/system.js";
import { getNetworkInterfaces, getRoutes, getFirewallRules } from "./probe/network-info.js";

export class Orchestrator {
  private lastProbe: ProbeResult | null = null;

  getLastProbe(): ProbeResult | null {
    return this.lastProbe;
  }

  async runProbe(): Promise<ProbeResult> {
    const [
      ports, containers, dockerInfo, dockerImages, daemons,
      hostInfo, networkInterfaces, routes, firewallRules,
    ] = await Promise.all([
      scanPorts().catch(() => []),
      getContainers().catch(() => []),
      getDockerInfo().catch(() => null),
      getDockerImages().catch(() => []),
      scanDaemons().catch(() => []),
      getHostInfo().catch(() => null),
      getNetworkInterfaces().catch(() => []),
      getRoutes().catch(() => []),
      getFirewallRules().catch(() => []),
    ]);

    const result: ProbeResult = {
      ports,
      containers,
      dockerInfo,
      dockerImages,
      daemons,
      hostInfo,
      networkInterfaces,
      routes,
      firewallRules,
      timestamp: Date.now(),
    };

    this.lastProbe = result;
    return result;
  }

  async isDockerAvailable(): Promise<boolean> {
    return isDockerAvailable();
  }

  async getHostInfo(): Promise<HostInfo | null> {
    return getHostInfo();
  }

  async getNetworkInfo(): Promise<{ interfaces: NetworkInterface[]; routes: RouteInfo[]; firewall: FirewallRule[] }> {
    const [interfaces, routes, firewall] = await Promise.all([
      getNetworkInterfaces().catch(() => []),
      getRoutes().catch(() => []),
      getFirewallRules().catch(() => []),
    ]);
    return { interfaces, routes, firewall };
  }

  async getDockerImages(): Promise<DockerImage[]> {
    return getDockerImages();
  }
}
