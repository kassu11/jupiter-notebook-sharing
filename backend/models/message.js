const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
	{
		sender: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
			required: true,
		},
		text: {
			type: String,
			required: true,
			max: 500,
			index: "text",
		},
		seen: {
			type: Boolean,
			default: false,
		},
		groupId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "MessageGroup",
		},
	},
	{ timestamps: true }
);

const messageGroupSchema = new mongoose.Schema(
	{
		type: {
			type: String,
			enum: ["chat", "group"],
			default: "chat",
		},
		participants: {
			type: [
				{
					type: mongoose.Schema.Types.ObjectId,
					ref: "User",
				},
			],
			default: [],
		},
		name: {
			type: String,
			max: 50,
		},
		userTag: {
			type: String,
			max: 50,
		},
		image: {
			type: String,
			max: 500,
		},
	},
	{ timestamps: true }
);

const Message = mongoose.model("Message", messageSchema);
const MessageGroup = mongoose.model("MessageGroup", messageGroupSchema);

module.exports = { Message, MessageGroup };
