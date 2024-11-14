const express = require("express");
const cors = require("./middleware/cors");
const cookieParser = require("cookie-parser");
const app = express();
const http = require("http").createServer(app);
const socketIO = require("socket.io")(http, { cors: { origin: "https://kassu11.github.io" } });
module.exports = { socketIO };
const errorHandler = require("./middleware/errorMiddleware");

app.use(express.json({ limit: "50mb" }));
app.use(cookieParser());
app.use(cors);

socketIO.on("connection", require("./routes/socketRouter").socketConnection);

app.use("/api/files", require("./routes/fileRouter"));


app.get("/", (req, res) => res.json({ message: "Welcome to the application." }));

app.get("/error", (req, res) => {
	throw new Error("Error!");
});

app.use(errorHandler.errorHandler);
app.use(errorHandler.unknownEndpoint);

module.exports = http;
