// const mongoose = require("mongoose");
// const Post = require("../models/posts");
// const { User } = require("../models/users");
const { socketIO } = require("../app");
// const customFind = require("../utils/customFind");

// get all posts
const getPosts = async (req, res) => {
	// const { filter, search, tags, liked, author, comments } = req.query;
	// const userId = req.user?.userId;
	// const options = { search, removed: false };

	// if (tags) options.tags = [tags].flat();
	// if (author) options.author = author;
	// if (comments) options.isComment = true;
	// if (userId) {
	// 	const user = await User.findById(userId);
	// 	if (filter?.includes("followed")) options.followedByUser = user;
	// 	if (filter?.includes("friends")) options.friendsWithUser = user;
	// 	if (liked) options.filterLiked = liked;
	// 	options.hasLiked = userId;
	// }

	try {
		// const posts = await customFind(Post, options).populate("user");
		res.status(200).json({post: 10});
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

const hostLobby = async (req, res) => {
	const { id } = req.params;
	// const { userId } = req.user;

	try {

		// post.save();
		socketIO.emit("post/" + id, { likes: 1, dislikes: 2 });
		res.json({"likes": 5});
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

module.exports = {
	getPosts,
	hostLobby,
};
