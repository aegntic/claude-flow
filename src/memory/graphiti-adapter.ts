/**
 * Graphiti Memory Adapter for Claude-Flow
 * 
 * Integrates Graphiti's knowledge graph capabilities into Claude-Flow's
 * memory and hive-mind systems, enabling persistent, queryable memory
 * with rich relationships and temporal metadata.
 * 
 * @author Mattae Cooper @aegntic.ai
 * @since v2.0.0-alpha
 */

import { EventEmitter } from 'node:events';
import type { ILogger } from '../core/logger.js';
import { generateId } from '../utils/helpers.js';
import type { MemoryEntry } from './advanced-memory-manager.js';

export interface GraphitiConfig {
  enabled: boolean;
  apiEndpoint?: string;
  apiKey?: string;
  defaultGroupId?: string;
  maxNodes?: number;
  maxFacts?: number;
  enableAutoSync?: boolean;
  syncInterval?: number;
  enableTemporalTracking?: boolean;
  knowledgeRetentionDays?: number;
}

export interface GraphitiNode {
  uuid: string;
  name: string;
  entityType: string;
  observations: string[];
  groupId: string;
  createdAt: Date;
  updatedAt: Date;
  summary?: string;
}

export interface GraphitiEdge {
  uuid: string;
  from: string;
  to: string;
  relationType: string;
  groupId: string;
  createdAt: Date;
  invalid?: boolean;
  validUntil?: Date;
}

export interface GraphitiEpisode {
  uuid: string;
  name: string;
  content: string;
  source: 'text' | 'json' | 'message';
  sourceDescription?: string;
  groupId: string;
  createdAt: Date;
}

export interface GraphitiSearchResult {
  nodes?: GraphitiNode[];
  edges?: GraphitiEdge[];
  facts?: string[];
  relevanceScore: number;
}

export class GraphitiMemoryAdapter extends EventEmitter {
  private config: GraphitiConfig;
  private logger?: ILogger;
  private isConnected: boolean = false;
  private syncTimer?: NodeJS.Timeout;
  private episodeQueue: Map<string, GraphitiEpisode[]> = new Map();
  private nodeCache: Map<string, GraphitiNode> = new Map();
  private edgeCache: Map<string, GraphitiEdge> = new Map();

  constructor(config: GraphitiConfig, logger?: ILogger) {
    super();
    this.config = {
      enabled: true,
      maxNodes: 10000,
      maxFacts: 50000,
      enableAutoSync: true,
      syncInterval: 30000, // 30 seconds
      enableTemporalTracking: true,
      knowledgeRetentionDays: 90,
      ...config
    };
    this.logger = logger;
    
    if (this.config.enabled) {
      this.initialize();
    }
  }

  private async initialize(): Promise<void> {
    try {
      // Check if graphiti MCP server is available
      const isAvailable = await this.checkGraphitiAvailability();
      
      if (isAvailable) {
        this.isConnected = true;
        this.emit('connected');
        this.logger?.info('Graphiti memory adapter connected successfully');
        
        if (this.config.enableAutoSync) {
          this.startAutoSync();
        }
      } else {
        this.logger?.warn('Graphiti MCP server not available, running in fallback mode');
        this.emit('fallback');
      }
    } catch (error) {
      this.logger?.error('Failed to initialize Graphiti adapter', error);
      this.emit('error', error);
    }
  }

  private async checkGraphitiAvailability(): Promise<boolean> {
    // Check if graphiti MCP tools are available
    // This would be replaced with actual MCP tool check
    try {
      // Simulate checking for graphiti tools
      return typeof global.mcp__graphiti__add_memory === 'function';
    } catch {
      return false;
    }
  }

  /**
   * Add an episode to Graphiti's knowledge graph
   */
  async addMemory(
    name: string,
    content: string,
    options?: {
      source?: 'text' | 'json' | 'message';
      sourceDescription?: string;
      groupId?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<string> {
    const episode: GraphitiEpisode = {
      uuid: generateId(),
      name,
      content,
      source: options?.source || 'text',
      sourceDescription: options?.sourceDescription,
      groupId: options?.groupId || this.config.defaultGroupId || 'default',
      createdAt: new Date()
    };

    // Queue the episode for batch processing
    const groupQueue = this.episodeQueue.get(episode.groupId) || [];
    groupQueue.push(episode);
    this.episodeQueue.set(episode.groupId, groupQueue);

    // If connected to Graphiti, add immediately
    if (this.isConnected) {
      await this.flushEpisode(episode);
    }

    this.emit('memory:added', episode);
    return episode.uuid;
  }

  /**
   * Search for relevant nodes in the knowledge graph
   */
  async searchNodes(
    query: string,
    options?: {
      groupIds?: string[];
      maxNodes?: number;
      entityType?: string;
      centerNodeUuid?: string;
    }
  ): Promise<GraphitiSearchResult> {
    try {
      if (!this.isConnected) {
        return this.fallbackSearch(query, options);
      }

      // Use graphiti MCP tool to search
      // This would be replaced with actual MCP tool call
      const results = await this.callGraphitiTool('search_memory_nodes', {
        query,
        group_ids: options?.groupIds,
        max_nodes: options?.maxNodes || this.config.maxNodes,
        entity: options?.entityType,
        center_node_uuid: options?.centerNodeUuid
      });

      return {
        nodes: results.nodes,
        relevanceScore: results.relevanceScore || 0.5
      };
    } catch (error) {
      this.logger?.error('Failed to search nodes', error);
      return { nodes: [], relevanceScore: 0 };
    }
  }

  /**
   * Search for relevant facts in the knowledge graph
   */
  async searchFacts(
    query: string,
    options?: {
      groupIds?: string[];
      maxFacts?: number;
      centerNodeUuid?: string;
    }
  ): Promise<GraphitiSearchResult> {
    try {
      if (!this.isConnected) {
        return this.fallbackSearch(query, options);
      }

      // Use graphiti MCP tool to search facts
      const results = await this.callGraphitiTool('search_memory_facts', {
        query,
        group_ids: options?.groupIds,
        max_facts: options?.maxFacts || this.config.maxFacts,
        center_node_uuid: options?.centerNodeUuid
      });

      return {
        facts: results.facts,
        relevanceScore: results.relevanceScore || 0.5
      };
    } catch (error) {
      this.logger?.error('Failed to search facts', error);
      return { facts: [], relevanceScore: 0 };
    }
  }

  /**
   * Convert a MemoryEntry to Graphiti episode format
   */
  async fromMemoryEntry(entry: MemoryEntry): Promise<string> {
    const content = this.formatMemoryContent(entry);
    
    return this.addMemory(
      entry.key,
      content,
      {
        source: 'json',
        sourceDescription: `Memory entry from ${entry.namespace}`,
        groupId: entry.namespace,
        metadata: entry.metadata
      }
    );
  }

  /**
   * Get recent episodes from a group
   */
  async getRecentEpisodes(
    groupId?: string,
    limit: number = 10
  ): Promise<GraphitiEpisode[]> {
    try {
      if (!this.isConnected) {
        return Array.from(this.episodeQueue.get(groupId || 'default') || [])
          .slice(-limit);
      }

      const results = await this.callGraphitiTool('get_episodes', {
        group_id: groupId || this.config.defaultGroupId,
        last_n: limit
      });

      return results.episodes || [];
    } catch (error) {
      this.logger?.error('Failed to get recent episodes', error);
      return [];
    }
  }

  /**
   * Clear all data from the knowledge graph
   */
  async clearGraph(): Promise<void> {
    try {
      if (this.isConnected) {
        await this.callGraphitiTool('clear_graph', {});
      }
      
      // Clear local caches
      this.nodeCache.clear();
      this.edgeCache.clear();
      this.episodeQueue.clear();
      
      this.emit('graph:cleared');
      this.logger?.info('Graphiti knowledge graph cleared');
    } catch (error) {
      this.logger?.error('Failed to clear graph', error);
      throw error;
    }
  }

  /**
   * Enable temporal reasoning by tracking fact validity
   */
  async updateFactValidity(
    edgeUuid: string,
    isValid: boolean,
    validUntil?: Date
  ): Promise<void> {
    if (!this.config.enableTemporalTracking) {
      return;
    }

    const edge = this.edgeCache.get(edgeUuid);
    if (edge) {
      edge.invalid = !isValid;
      edge.validUntil = validUntil;
      this.edgeCache.set(edgeUuid, edge);
      
      this.emit('fact:updated', { edgeUuid, isValid, validUntil });
    }
  }

  /**
   * Integrate with hive-mind for collective intelligence
   */
  async shareWithHiveMind(
    nodeUuids: string[],
    targetSwarms: string[]
  ): Promise<void> {
    const nodes = nodeUuids
      .map(uuid => this.nodeCache.get(uuid))
      .filter(Boolean) as GraphitiNode[];
    
    if (nodes.length > 0) {
      this.emit('hivemind:share', {
        nodes,
        targetSwarms,
        timestamp: new Date()
      });
      
      this.logger?.info(`Shared ${nodes.length} nodes with hive-mind`);
    }
  }

  /**
   * Get memory statistics
   */
  getStatistics(): {
    totalNodes: number;
    totalEdges: number;
    queuedEpisodes: number;
    cacheSize: number;
    isConnected: boolean;
  } {
    return {
      totalNodes: this.nodeCache.size,
      totalEdges: this.edgeCache.size,
      queuedEpisodes: Array.from(this.episodeQueue.values())
        .reduce((sum, queue) => sum + queue.length, 0),
      cacheSize: this.nodeCache.size + this.edgeCache.size,
      isConnected: this.isConnected
    };
  }

  // Private helper methods

  private formatMemoryContent(entry: MemoryEntry): string {
    const content = {
      key: entry.key,
      value: entry.value,
      type: entry.type,
      tags: entry.tags,
      metadata: entry.metadata,
      references: entry.references,
      dependencies: entry.dependencies
    };
    
    return JSON.stringify(content, null, 2);
  }

  private async flushEpisode(episode: GraphitiEpisode): Promise<void> {
    try {
      await this.callGraphitiTool('add_memory', {
        name: episode.name,
        episode_body: episode.content,
        source: episode.source,
        source_description: episode.sourceDescription,
        group_id: episode.groupId,
        uuid: episode.uuid
      });
    } catch (error) {
      this.logger?.error('Failed to flush episode to Graphiti', error);
      throw error;
    }
  }

  private async callGraphitiTool(toolName: string, params: any): Promise<any> {
    // This would be replaced with actual MCP tool invocation
    // For now, we'll simulate the call
    this.logger?.debug(`Calling Graphiti tool: ${toolName}`, params);
    
    // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Return mock data for development
    return {
      nodes: [],
      edges: [],
      facts: [],
      episodes: [],
      relevanceScore: 0.75
    };
  }

  private fallbackSearch(
    query: string,
    options?: any
  ): GraphitiSearchResult {
    // Simple fallback search in local cache
    const results: GraphitiNode[] = [];
    
    for (const node of this.nodeCache.values()) {
      if (
        node.name.toLowerCase().includes(query.toLowerCase()) ||
        node.observations.some(obs => 
          obs.toLowerCase().includes(query.toLowerCase())
        )
      ) {
        results.push(node);
      }
    }
    
    return {
      nodes: results.slice(0, options?.maxNodes || 10),
      relevanceScore: results.length > 0 ? 0.5 : 0
    };
  }

  private startAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }
    
    this.syncTimer = setInterval(async () => {
      await this.syncWithGraphiti();
    }, this.config.syncInterval!);
  }

  private async syncWithGraphiti(): Promise<void> {
    // Flush queued episodes
    for (const [groupId, episodes] of this.episodeQueue.entries()) {
      for (const episode of episodes) {
        try {
          await this.flushEpisode(episode);
        } catch (error) {
          this.logger?.error('Failed to sync episode', error);
        }
      }
      this.episodeQueue.set(groupId, []);
    }
    
    this.emit('sync:completed', new Date());
  }

  /**
   * Cleanup resources
   */
  async destroy(): Promise<void> {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = undefined;
    }
    
    // Flush remaining episodes
    await this.syncWithGraphiti();
    
    this.nodeCache.clear();
    this.edgeCache.clear();
    this.episodeQueue.clear();
    this.isConnected = false;
    
    this.emit('destroyed');
  }
}

export default GraphitiMemoryAdapter;