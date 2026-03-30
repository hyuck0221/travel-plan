import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { v4 as uuidv4 } from "uuid";
import { zlibSync, unzlibSync } from "node:zlib";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Load .env.local from project root
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const BASE_URL = process.env.BASE_URL || "https://travel.hspace.site";

// Helper: UUID string to 16-byte Uint8Array
function uuidToBytes(uuid) {
  if (!uuid || uuid.length !== 36) return new Uint8Array(16);
  const hex = uuid.replace(/-/g, "");
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

async function encodeState(state) {
  try {
    const encoder = new TextEncoder();
    const titleBytes = encoder.encode(state.title || "");
    const items = state.items || [];

    // Calculate buffer size
    let size = 1 + 1 + titleBytes.length + 16 + 2;
    const encodedItems = items.map((item) => {
      const dest = encoder.encode(item.destination || "");
      const addr = encoder.encode(item.address || "");
      const memo = encoder.encode(item.memo || "");
      const date = encoder.encode(item.date || "");
      const time = encoder.encode(item.time || "");
      const category = encoder.encode(item.category || "");
      const cost = encoder.encode(item.cost || "");

      size += 1 + dest.length + 1 + addr.length + 8 + 2 + memo.length + 1 + date.length + 1 + time.length + 16 + 1 + category.length + 1 + cost.length;
      return { dest, addr, memo, date, time, lat: item.lat, lng: item.lng, id: item.id || uuidv4(), category, cost };
    });

    const buffer = new ArrayBuffer(size);
    const view = new DataView(buffer);
    let offset = 0;

    view.setUint8(offset++, 3); // Version 3
    view.setUint8(offset++, titleBytes.length);
    new Uint8Array(buffer, offset, titleBytes.length).set(titleBytes);
    offset += titleBytes.length;

    new Uint8Array(buffer, offset, 16).set(uuidToBytes(state.id || uuidv4()));
    offset += 16;

    view.setUint16(offset, items.length);
    offset += 2;

    for (const i of encodedItems) {
      view.setFloat32(offset, i.lat != null ? i.lat : NaN); offset += 4;
      view.setFloat32(offset, i.lng != null ? i.lng : NaN); offset += 4;

      const writeStr = (bytes) => {
        const len = Math.min(bytes.length, 255);
        view.setUint8(offset++, len);
        new Uint8Array(buffer, offset, len).set(bytes.slice(0, len));
        offset += len;
      };

      const writeLongStr = (bytes) => {
        const len = Math.min(bytes.length, 65535);
        view.setUint16(offset, len); offset += 2;
        new Uint8Array(buffer, offset, len).set(bytes.slice(0, len));
        offset += len;
      };

      writeStr(i.dest);
      writeStr(i.addr);
      writeLongStr(i.memo);
      writeStr(i.date);
      writeStr(i.time);
      new Uint8Array(buffer, offset, 16).set(uuidToBytes(i.id));
      offset += 16;
      writeStr(i.category);
      writeStr(i.cost);
    }

    const finalBuffer = buffer.slice(0, offset);
    
    // Using zlibSync for synchronous compression in Node.js
    // Note: zlib.deflateSync corresponds to CompressionStream('deflate')
    const compressedBuffer = zlibSync(new Uint8Array(finalBuffer));
    
    return Buffer.from(compressedBuffer)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
  } catch (e) {
    console.error("Encode error:", e);
    return "";
  }
}

const server = new Server(
  {
    name: "travel-plan-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

async function shortenUrl(url) {
  const apiKey = process.env.APISIS_API_KEY;
  if (!apiKey) return url;

  try {
    const response = await fetch("https://apisis.dev/api/url/short/apisis", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) return url;

    const data = await response.json();
    return data?.payload?.url || url;
  } catch (err) {
    console.error("Shorten error:", err);
    return url;
  }
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "search_places",
        description: "Search for places (destinations) to get their coordinates and addresses using Naver Maps API.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The name of the place to search for (e.g., 'Tokyo Tower', 'Seoul Station')",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "create_travel_plan",
        description: "Generate a travel plan link that can be opened in the travel-plan web app.",
        inputSchema: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "The title of the travel plan",
            },
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  destination: { type: "string" },
                  address: { type: "string" },
                  lat: { type: "number" },
                  lng: { type: "number" },
                  memo: { type: "string" },
                  date: { type: "string", description: "YYYY-MM-DD" },
                  time: { type: "string", description: "HH:mm" },
                  category: { type: "string" },
                  cost: { type: "string" },
                },
                required: ["destination"],
              },
            },
          },
          required: ["title", "items"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "search_places") {
    const { query } = args;
    const clientId = process.env.NAVER_CLIENT_ID;
    const clientSecret = process.env.NAVER_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return {
        content: [{ type: "text", text: "Error: Naver API credentials not configured in MCP server environment." }],
        isError: true,
      };
    }

    try {
      const url = `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=10&sort=random`;
      const response = await fetch(url, {
        headers: {
          "X-Naver-Client-Id": clientId,
          "X-Naver-Client-Secret": clientSecret,
        },
      });

      if (!response.ok) {
        throw new Error(`Naver API error: ${response.status}`);
      }

      const data = await response.json();
      const items = (data.items || []).map((item) => ({
        title: item.title.replace(/<[^>]+>/g, ""),
        category: item.category,
        address: item.address,
        roadAddress: item.roadAddress,
        lng: parseInt(item.mapx, 10) / 1e7,
        lat: parseInt(item.mapy, 10) / 1e7,
      }));

      return {
        content: [{ type: "text", text: JSON.stringify(items, null, 2) }],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Search error: ${err.message}` }],
        isError: true,
      };
    }
  }

  if (name === "create_travel_plan") {
    const { title, items } = args;
    const planId = uuidv4();
    const state = {
      id: planId,
      title,
      items: items.map(item => ({
        ...item,
        id: uuidv4(),
        lat: item.lat || null,
        lng: item.lng || null,
        memo: item.memo || "",
        date: item.date || "",
        time: item.time || "",
        category: item.category || "",
        cost: item.cost || "",
      }))
    };

    const encoded = await encodeState(state);
    const fullUrl = `${BASE_URL}/#${encoded}`;
    const shortUrl = await shortenUrl(fullUrl);

    return {
      content: [
        { 
          type: "text", 
          text: `Travel plan created successfully!\n\nTitle: ${title}\nItems: ${items.length}\nURL: ${shortUrl}` 
        }
      ],
    };
  }

  throw new Error(`Tool not found: ${name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Travel Plan MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
