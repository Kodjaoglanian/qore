import type { NetworkInterface, RouteInfo, FirewallRule } from "../types.js";

export async function getNetworkInterfaces(): Promise<NetworkInterface[]> {
  try {
    const proc = Bun.spawn(["ip", "-o", "addr", "show"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    const interfaces: NetworkInterface[] = [];
    const ifaceMap = new Map<string, NetworkInterface>();

    for (const line of output.trim().split("\n")) {
      const parts = line.split(/\s+/);
      if (parts.length < 4) continue;
      const name = parts[1];
      const state = parts[2];
      const rest = parts.slice(3).join(" ");

      if (!ifaceMap.has(name)) {
        const iface: NetworkInterface = {
          name,
          flags: "",
          mtu: 0,
          state,
          mac: "",
          ipv4: [],
          ipv6: [],
        };
        ifaceMap.set(name, iface);
        interfaces.push(iface);
      }

      const iface = ifaceMap.get(name)!;

      const inetMatch = rest.match(/inet\s+(\S+)/);
      if (inetMatch) iface.ipv4.push(inetMatch[1]);

      const inet6Match = rest.match(/inet6\s+(\S+)/);
      if (inet6Match) iface.ipv6.push(inet6Match[1]);
    }

    const linkProc = Bun.spawn(["ip", "-o", "link", "show"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const linkOutput = await new Response(linkProc.stdout).text();
    for (const line of linkOutput.trim().split("\n")) {
      const match = line.match(/^\d+:\s+(\S+):\s+<(\S+)>\s+mtu\s+(\d+).*\n\s*link\/ether\s+(\S+)/);
      if (match) {
        const name = match[1];
        const iface = ifaceMap.get(name);
        if (iface) {
          iface.flags = match[2];
          iface.mtu = parseInt(match[3]);
          iface.mac = match[4];
        }
      }
    }

    return interfaces;
  } catch {
    return [];
  }
}

export async function getRoutes(): Promise<RouteInfo[]> {
  try {
    const proc = Bun.spawn(["route", "-n"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    const lines = output.trim().split("\n").slice(2);
    const routes: RouteInfo[] = [];
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 8) {
        routes.push({
          destination: parts[0],
          gateway: parts[1],
          genmask: parts[2],
          flags: parts[3],
          interface: parts[7],
          metric: parseInt(parts[5]) || 0,
        });
      }
    }
    return routes;
  } catch {
    return [];
  }
}

export async function getFirewallRules(): Promise<FirewallRule[]> {
  const rules: FirewallRule[] = [];

  try {
    const proc = Bun.spawn(["iptables", "-L", "-n", "--line-numbers"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    let currentChain = "";
    for (const line of output.trim().split("\n")) {
      const chainMatch = line.match(/^Chain\s+(\S+)/);
      if (chainMatch) {
        currentChain = chainMatch[1];
        continue;
      }
      if (line.startsWith("num") || line.startsWith("target")) continue;
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 8 && currentChain) {
        rules.push({
          chain: currentChain,
          target: parts[1],
          protocol: parts[2],
          source: parts[4],
          destination: parts[5],
          port: parts[6] ?? "",
          interface: parts[7] ?? "",
        });
      }
    }
  } catch {}

  if (rules.length === 0) {
    try {
      const proc = Bun.spawn(["ufw", "status", "verbose"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const output = await new Response(proc.stdout).text();
      for (const line of output.trim().split("\n")) {
        if (line.includes("Status:") || line.includes("Logging:") || line.trim() === "") continue;
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3) {
          rules.push({
            chain: "ufw",
            target: parts[0],
            protocol: parts[2] ?? "",
            source: parts[4] ?? "",
            destination: "",
            port: parts[1] ?? "",
            interface: "",
          });
        }
      }
    } catch {}
  }

  return rules;
}
