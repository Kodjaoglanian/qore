import type { DiscoveredPort } from "../types.js";

const KNOWN_SERVICES: Record<number, string> = {
  22: "SSH",
  25: "SMTP",
  53: "DNS",
  80: "HTTP",
  110: "POP3",
  143: "IMAP",
  443: "HTTPS",
  465: "SMTPS",
  587: "SMTP",
  993: "IMAPS",
  995: "POP3S",
  1433: "SQL Server",
  1521: "Oracle DB",
  2375: "Docker API",
  2376: "Docker TLS",
  3000: "HTTP (dev)",
  3306: "MySQL",
  3389: "RDP",
  4369: "Erlang EPMD",
  5000: "HTTP (Flask)",
  5432: "PostgreSQL",
  5672: "RabbitMQ AMQP",
  5900: "VNC",
  6379: "Redis",
  6443: "Kubernetes API",
  8000: "HTTP (Django)",
  8080: "HTTP (proxy)",
  8081: "HTTP (alt)",
  8443: "HTTPS (alt)",
  8888: "HTTP (Jupyter)",
  9000: "HTTP (PHP-FPM)",
  9042: "Cassandra",
  9090: "Prometheus",
  9092: "Kafka",
  9200: "Elasticsearch",
  9300: "Elasticsearch",
  11211: "Memcached",
  15672: "RabbitMQ Mgmt",
  27017: "MongoDB",
  27018: "MongoDB (TLS)",
  27019: "MongoDB (cluster)",
};

export async function scanPorts(): Promise<DiscoveredPort[]> {
  try {
    const proc = Bun.spawn(["lsof", "-i", "-P", "-n"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const text = await new Response(proc.stdout).text();
    await proc.exited;
    return parseLsof(text);
  } catch {
    return [];
  }
}

function parseLsof(text: string): DiscoveredPort[] {
  const lines = text.split("\n").slice(1); // skip header
  const seen = new Set<string>();
  const results: DiscoveredPort[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parts = trimmed.split(/\s+/);
    if (parts.length < 9) continue;

    const command = parts[0];
    const pid = parseInt(parts[1], 10);
    const protocol = parts[7];
    const addrPart = parts[8];

    const portMatch = addrPart.match(/:(\d+)$/);
    if (!portMatch) continue;

    const port = parseInt(portMatch[1], 10);
    const state = parts.length > 9 ? parts.slice(9).join(" ") : "LISTEN";

    const key = `${port}-${protocol}`;
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      port,
      protocol: protocol.includes("udp") ? "udp" : "tcp",
      service: KNOWN_SERVICES[port] ?? guessService(command, port),
      pid: isNaN(pid) ? 0 : pid,
      command,
      state,
    });
  }

  return results.sort((a, b) => a.port - b.port);
}

function guessService(command: string, port: number): string {
  const cmd = command.toLowerCase();
  if (cmd.includes("docker")) return "Docker";
  if (cmd.includes("node") || cmd.includes("bun")) return "Node.js/Bun";
  if (cmd.includes("python")) return "Python";
  if (cmd.includes("java")) return "Java";
  if (cmd.includes("postgres")) return "PostgreSQL";
  if (cmd.includes("mysql")) return "MySQL";
  if (cmd.includes("redis")) return "Redis";
  if (cmd.includes("nginx")) return "Nginx";
  if (cmd.includes("apache")) return "Apache";
  if (cmd.includes("mongod")) return "MongoDB";
  return `:${port}`;
}
