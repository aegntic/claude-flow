/**
 * Graphiti Configuration for Claude-Flow
 * 
 * Enables knowledge graph-based memory and collective intelligence
 */

import { z } from 'zod';

export interface GraphitiConfiguration {
  enabled: boolean;
  mcp: {
    serverName: string;
    available: boolean;
  };
  memory: {
    adapter: {
      enabled: boolean;
      defaultGroupId: string;
      maxNodes: number;
      maxFacts: number;
      enableAutoSync: boolean;
      syncInterval: number;
      enableTemporalTracking: boolean;
      knowledgeRetentionDays: number;
    };
  };
  hiveMind: {
    integration: {
      enabled: boolean;
      enablePatternExtraction: boolean;
      enableInsightGeneration: boolean;
      enableKnowledgeEvolution: boolean;
      graphGroupPrefix: string;
      minPatternConfidence: number;
      insightGenerationInterval: number;
      knowledgeEvolutionThreshold: number;
    };
  };
  features: {
    episodeProcessing: boolean;
    nodeRelationships: boolean;
    temporalReasoning: boolean;
    collectiveIntelligence: boolean;
    knowledgeSharing: boolean;
    patternRecognition: boolean;
    insightGeneration: boolean;
  };
}

export const defaultGraphitiConfig: GraphitiConfiguration = {
  enabled: true,
  mcp: {
    serverName: 'graphiti',
    available: false // Will be checked at runtime
  },
  memory: {
    adapter: {
      enabled: true,
      defaultGroupId: 'claude_flow_default',
      maxNodes: 10000,
      maxFacts: 50000,
      enableAutoSync: true,
      syncInterval: 30000, // 30 seconds
      enableTemporalTracking: true,
      knowledgeRetentionDays: 90
    }
  },
  hiveMind: {
    integration: {
      enabled: true,
      enablePatternExtraction: true,
      enableInsightGeneration: true,
      enableKnowledgeEvolution: true,
      graphGroupPrefix: 'hivemind_',
      minPatternConfidence: 0.7,
      insightGenerationInterval: 60000, // 1 minute
      knowledgeEvolutionThreshold: 0.8
    }
  },
  features: {
    episodeProcessing: true,
    nodeRelationships: true,
    temporalReasoning: true,
    collectiveIntelligence: true,
    knowledgeSharing: true,
    patternRecognition: true,
    insightGeneration: true
  }
};

/**
 * Check if Graphiti MCP server is available
 */
export async function checkGraphitiAvailability(): Promise<boolean> {
  try {
    // Check if graphiti MCP tools are available in the global context
    // This would be replaced with actual MCP server check
    const hasTool = typeof (global as any).mcp__graphiti__add_memory === 'function';
    return hasTool;
  } catch (error) {
    console.warn('Graphiti MCP server not available:', error);
    return false;
  }
}

/**
 * Get Graphiti configuration with runtime checks
 */
export async function getGraphitiConfig(): Promise<GraphitiConfiguration> {
  const config = { ...defaultGraphitiConfig };
  config.mcp.available = await checkGraphitiAvailability();
  
  if (!config.mcp.available) {
    console.warn('Graphiti MCP server not available, some features will be limited');
    // Disable features that require MCP server
    config.memory.adapter.enableAutoSync = false;
    config.hiveMind.integration.enableKnowledgeEvolution = false;
  }
  
  return config;
}

export default defaultGraphitiConfig;