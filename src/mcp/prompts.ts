export interface PromptDef {
  name: string;
  description: string;
  arguments: Array<{
    name: string;
    description: string;
    required: boolean;
  }>;
  getMessages: (args: Record<string, string>) => Array<{
    role: "user" | "assistant";
    content: { type: "text"; text: string };
  }>;
}

export const prompts: PromptDef[] = [
  {
    name: "diagnose_infra",
    description: "Analyze the infrastructure and identify potential issues",
    arguments: [],
    getMessages: () => [
      {
        role: "user",
        content: {
          type: "text",
          text: `Analyze the current infrastructure and identify potential issues.

Use the following tools to gather information:
1. Call discover_system_info to get host info
2. Call discover_ports to list open ports
3. Call discover_containers to list Docker containers
4. Call discover_processes to see top processes
5. Call discover_services to check systemd services

After gathering the data, provide:
- Summary of the infrastructure
- Any potential issues (high CPU/memory usage, stopped containers, failed services)
- Recommendations for improvement`,
        },
      },
    ],
  },
  {
    name: "security_audit",
    description: "Perform a security audit of open ports and running services",
    arguments: [],
    getMessages: () => [
      {
        role: "user",
        content: {
          type: "text",
          text: `Perform a security audit of this machine.

1. Call discover_ports to list all open ports
2. Call discover_services to list running services
3. Call discover_network to check firewall rules
4. Call sys_processes to see running processes

Analyze:
- Exposed ports that should not be public
- Missing firewall rules
- Services running that could be security risks
- Suspicious processes

Provide a security score and actionable recommendations.`,
        },
      },
    ],
  },
  {
    name: "container_health",
    description: "Check health of all Docker containers",
    arguments: [],
    getMessages: () => [
      {
        role: "user",
        content: {
          type: "text",
          text: `Check the health of all Docker containers.

1. Call docker_list to get all containers
2. For each running container, call docker_stats to get resource usage
3. For any stopped containers, call docker_logs to check for errors

Provide:
- Health status for each container (healthy/warning/critical)
- Resource usage summary
- Any containers that need attention
- Recommendations for optimization`,
        },
      },
    ],
  },
  {
    name: "db_health_check",
    description: "Check database health for a specific connection",
    arguments: [
      {
        name: "connection",
        description: "Database connection name from qore vault",
        required: true,
      },
    ],
    getMessages: (args) => [
      {
        role: "user",
        content: {
          type: "text",
          text: `Check the health of database connection "${args.connection}".

1. Call db_list_databases with connection "${args.connection}" to see all databases
2. For each database, call db_list_tables to see table count
3. Call db_query with "SELECT 1" to test connectivity

Provide:
- Connection status
- Database list with table counts
- Any connectivity issues
- Recommendations for optimization`,
        },
      },
    ],
  },
];
