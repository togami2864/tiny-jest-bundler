import WebSocket, { WebSocketServer } from "ws";
const port = 24678;
const wsScript = `
const ws = new WebSocket("ws://localhost:${port}")
ws.addEventListener("message", ({data}) => {
    const msg = JSON.parse(data)
    if(msg.type === "reload"){
        location.reload()
    }
})
`;

export const setupReloadServer = () => {
  const wss = new WebSocketServer({
    port: 24678,
    host: "localhost",
  });
  let ws: WebSocket;
  console.log("web socket server listen on ws://localhost:24678");
  wss.on("connection", (connectWs) => {
    ws = connectWs;
  });
  return {
    send(data) {
      if (!ws) return;
      ws.send(JSON.stringify(data));
    },
  };
};
