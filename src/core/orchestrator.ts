import type { ProbeResult } from "./types.js";
import { scanPorts } from "./probe/network.js";
import { getContainers, getDockerInfo, isDockerAvailable } from "./probe/docker.js";
import { scanDaemons } from "./probe/daemon.js";

export class Orchestrator {
  private lastProbe: ProbeResult | null = null;

  getLastProbe(): ProbeResult | null {
    return this.lastProbe;
  }

  async runProbe(): Promise<ProbeResult> {
    const [ports, containers, dockerInfo, daemons] = await Promise.all([
      scanPorts().catch(() => []),
      getContainers().catch(() => []),
      getDockerInfo().catch(() => null),
      scanDaemons().catch(() => []),
    ]);

    const result: ProbeResult = {
      ports,
      containers,
      dockerInfo,
      daemons,
      timestamp: Date.now(),
    };

    this.lastProbe = result;
    return result;
  }

  async isDockerAvailable(): Promise<boolean> {
    return isDockerAvailable();
  }
}
