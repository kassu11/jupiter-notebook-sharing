const socketConnection = (socket) => {
	console.log(`⚡: ${socket.id} user just connected!`);

	// Public socket here

	socket.on("disconnect", () => {
		console.log(`🔥: A user ${socket.id} disconnected`);
	});
};

module.exports = socketConnection;
