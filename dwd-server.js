#!/usr/bin/env node

// DWD MCP Server - Simple standalone implementation
// This provides access to the Deutsche Wetterdienst (DWD) API through the MCP protocol

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  ListToolsRequestSchema, 
  CallToolRequestSchema 
} from '@modelcontextprotocol/sdk/types.js';

// Create server instance
const server = new Server(
  {
    name: "dwd-mcp-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Utility function for making API requests
async function fetchDWDData(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`DWD API Error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

// Define tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_station_data",
        description: "Get current weather data for specific DWD weather stations",
        inputSchema: {
          type: "object",
          properties: {
            stationIds: {
              oneOf: [
                { type: "string" },
                { type: "number" },
                { 
                  type: "array", 
                  items: {
                    oneOf: [
                      { type: "string" },
                      { type: "number" }
                    ]
                  } 
                }
              ],
              description: "Station IDs for the DWD weather stations"
            }
          },
          required: ["stationIds"]
        }
      },
      {
        name: "get_nowcast_warnings",
        description: "Get current nowcast weather warnings in Germany",
        inputSchema: {
          type: "object",
          properties: {
            language: {
              type: "string",
              enum: ["de", "en"],
              default: "de",
              description: "Language for warnings (de or en)"
            }
          }
        }
      }
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    if (!request.params.arguments) {
      throw new Error("Arguments are required");
    }

    switch (request.params.name) {
      case "get_station_data": {
        const { stationIds } = request.params.arguments;
        
        if (!stationIds) {
          throw new Error("stationIds parameter is required");
        }
        
        // Convert to array if it's a single value
        const idArray = Array.isArray(stationIds) ? stationIds : [stationIds];
        
        const url = `https://app-prod-ws.warnwetter.de/v30/stationOverviewExtended?stationIds=${idArray.join(",")}`;
        const result = await fetchDWDData(url);
        
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "get_nowcast_warnings": {
        const { language = "de" } = request.params.arguments || {};
        const endpoint = language === "en" ? "warnings_nowcast_en.json" : "warnings_nowcast.json";
        const url = `https://s3.eu-central-1.amazonaws.com/app-prod-static.warnwetter.de/v16/${endpoint}`;
        
        const result = await fetchDWDData(url);
        
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${request.params.name}`);
    }
  } catch (error) {
    console.error("Error:", error);
    throw new Error(`Error: ${error.message}`);
  }
});

// Start the server
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("DWD MCP Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});