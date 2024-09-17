const mongoose = require("mongoose");

const postSchema = new mongoose.Schema(
	{
		user: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "User",
		},
		postText: {
			type: String,
			required: true,
			max: 500,
			index: "text",
		},
		images: {
			type: Array,
			default: [],
		},
		likes: {
			type: Array,
			default: [],
		},
		dislikes: {
			type: Array,
			default: [],
		},
		comments: {
			type: [
				{
					type: mongoose.Schema.Types.ObjectId,
					ref: "Post",
				},
			],
			default: [],
		},
		originalPostParentId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Post",
		},
		replyParentId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "Post",
		},
		nestingLevel: {
			type: Number,
			default: 0,
		},
		removed: {
			type: Boolean,
			default: false,
		},
		edited: {
			type: Boolean,
			default: false,
		},
		tags: {
			type: Array,
			default: [],
		},
	},
	{ timestamps: true }
);

const Post = mongoose.model("Post", postSchema);

module.exports = Post;
