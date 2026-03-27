import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { v4 as uuidv4 } from "uuid";
import { zlibSync } from "node:zlib";

// Core logic: Travel Plan Binary Encoding (Reuse version 3)
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
    view.setUint8(offset++, 3);
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

// MCP Server Instance
const server = new Server(
  { name: "travel-plan-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "search_places",
        description: "Search for places using Naver Maps API to get coordinates.",
        inputSchema: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
        },
      },
      {
        name: "create_travel_plan",
        description: "Generate a link for the travel-plan app.",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string" },
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
                  date: { type: "string" },
                  time: { type: "string" },
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
    if (!clientId || !clientSecret) throw new Error("Credentials missing");

    const url = `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=10&sort=random`;
    const response = await fetch(url, {
      headers: { "X-Naver-Client-Id": clientId, "X-Naver-Client-Secret": clientSecret },
    });
    const data = await response.json();
    const items = (data.items || []).map((item) => ({
      title: item.title.replace(/<[^>]+>/g, ""),
      address: item.address,
      lng: parseInt(item.mapx, 10) / 1e7,
      lat: parseInt(item.mapy, 10) / 1e7,
    }));

    return { content: [{ type: "text", text: JSON.stringify(items, null, 2) }] };
  }

  if (name === "create_travel_plan") {
    const { title, items } = args;
    const state = {
      id: uuidv4(), title,
      items: items.map(item => ({
        ...item, id: uuidv4(),
        lat: item.lat || null, lng: item.lng || null,
        memo: item.memo || "", date: item.date || "", time: item.time || "",
        category: item.category || "", cost: item.cost || ""
      }))
    };
    const encoded = await encodeState(state);
    const baseUrl = process.env.BASE_URL || "https://travel.hspace.site";
    return {
      content: [{ type: "text", text: `Link: ${baseUrl}/#${encoded}` }],
    };
  }
  throw new Error("Tool not found");
});

// SSE Transport Handler for Vercel
let transport = null;

export default async function handler(req, res) {
  if (req.method === "GET") {
    // 1. Establish SSE Connection
    transport = new SSEServerTransport("/mcp", res);
    await server.connect(transport);
    
    // Cleanup on disconnect
    res.on("close", async () => {
      await server.close();
      transport = null;
    });
  } else if (req.method === "POST") {
    // 2. Handle Client Messages
    if (!transport) {
      return res.status(400).json({ error: "No active SSE session" });
    }
    await transport.handlePostMessage(req, res);
  } else {
    res.status(405).json({ error: "Method not allowed" });
  }
}
