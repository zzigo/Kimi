import { WebSocketServer, WebSocket } from "ws";
import { networkInterfaces } from "os";
import http from "http";

function getLocalIP() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return "localhost";
}

const localIP = getLocalIP();
const server = http.createServer((req, res) => {
  if (req.url === "/ip") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ip: localIP }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });
server.listen(3003);

const users = new Map(); // websocket -> user data
const userIds = new Map(); // userId -> websocket
let timer = null;
let seconds = 0;

function formatTime(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0"
  )}:${String(seconds).padStart(2, "0")}`;
}

function broadcastUsers() {
  const userList = Array.from(users.values()).map(
    ({ id, name, color, ip }) => ({
      id,
      name,
      color,
      ip,
    })
  );

  const message = JSON.stringify({
    type: "users",
    users: userList,
  });

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

function broadcastTime() {
  const timeStr = formatTime(seconds);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(
        JSON.stringify({
          type: "time",
          time: timeStr,
        })
      );
    }
  });
}

wss.on("connection", (ws, req) => {
  const ip = localIP;
  console.log("Client connected with local IP:", ip);

  ws.on("message", (data) => {
    const message = JSON.parse(data);

    switch (message.type) {
      case "join":
        // Remove any existing connection for this user ID
        const existingWs = userIds.get(message.user.id);
        if (existingWs) {
          users.delete(existingWs);
          userIds.delete(message.user.id);
          if (existingWs !== ws && existingWs.readyState === WebSocket.OPEN) {
            existingWs.close();
          }
        }

        // Add new user
        users.set(ws, { ...message.user, ip });
        userIds.set(message.user.id, ws);
        broadcastUsers();
        break;

      case "synth":
        // Broadcast synth command to all clients
        const synthMessage = JSON.stringify({
          type: "synth",
          command: message.command,
          source: message.source,
        });
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(synthMessage);
          }
        });
        break;

      case "update":
        const existingUser = users.get(ws);
        if (existingUser) {
          const updatedUser = {
            ...message.user,
            ip: existingUser.ip,
          };
          users.set(ws, updatedUser);
          userIds.set(message.user.id, ws);
          broadcastUsers();
        }
        break;

      case "reset":
        seconds = 0;
        broadcastTime();
        break;

      case "start":
        if (!timer) {
          timer = setInterval(() => {
            seconds++;
            broadcastTime();
          }, 1000);
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: "start" }));
            }
          });
        }
        break;

      case "stop":
        if (timer) {
          clearInterval(timer);
          timer = null;
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: "stop" }));
            }
          });
        }
        break;
    }
  });

  ws.on("close", () => {
    const user = users.get(ws);
    if (user) {
      userIds.delete(user.id);
      users.delete(ws);
      broadcastUsers();
    }
    console.log("Client disconnected");
  });

  // Send current time on connection
  ws.send(
    JSON.stringify({
      type: "time",
      time: formatTime(seconds),
    })
  );

  // Send current users list
  ws.send(
    JSON.stringify({
      type: "users",
      users: Array.from(users.values()).map(({ id, name, color, ip }) => ({
        id,
        name,
        color,
        ip,
      })),
    })
  );

  // Send timer state
  if (timer) {
    ws.send(JSON.stringify({ type: "start" }));
  }
});

console.log("WebSocket server running on ws://localhost:3003");
