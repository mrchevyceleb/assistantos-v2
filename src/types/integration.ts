/**
 * Integration Types
 *
 * Type definitions for MCP integration configurations.
 */

export interface IntegrationConfig {
  enabled: boolean
  envVars: Record<string, string>
}
