const mongoose = require("mongoose");

const imageSchema = new mongoose.Schema(
	{
		user: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: true,
		},
		url: {
			type: String,
			required: true,
			max: 100,
		},
		deleteHash: {
			type: String,
			required: true,
			max: 100,
		},
	},
	{ timestamps: true }
);

const Image = mongoose.model("Image", imageSchema);

module.exports = Image;
