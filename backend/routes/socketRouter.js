const {hostedFiles, hostingUsers} = require("../controllers/fileRouter");

const socketConnection = (socket) => {
	console.log(`⚡: ${socket.id} user just connected!`);

	socket.on("disconnect", () => {
		console.log(`🔥: A user ${socket.id} disconnected`);
		if (hostingUsers[socket.id]) {
			delete hostedFiles[hostingUsers[socket.id]];
		}
		delete hostingUsers[socket.id];
	});

	socket.on("post", e => {
		console.log("????????????????????", e);
	})

	// socket.on("host", data => {
	// 	const valid = ("key" in data && "files" in data && data.key.length > 1);
	// 	if (!valid) return;
	// })
};

module.exports = { socketConnection };
