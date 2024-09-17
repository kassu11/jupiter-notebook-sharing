const mongoose = require("mongoose");

const refreshToken = new mongoose.Schema({
	userId: {
		type: String,
		required: true,
		unqiue: true,
	},
	token: {
		type: String,
		required: true,
	},
});

const RefreshToken = mongoose.model("refreshToken", refreshToken);

module.exports = RefreshToken;
