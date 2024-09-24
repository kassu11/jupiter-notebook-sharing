// const mongoose = require("mongoose");
const Filo = require("../models/Filo");
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

const hostedFiles = {}
const hostingUsers = {}

const hostFiles = async (req, res) => {
	const { id, key, fileData } = req.body;
	// console.log(id, key, fileData, req.body);

	console.log(hostedFiles, hostingUsers)

	try {
		if (key in hostedFiles) throw new Error("Dublicate room key");
		if (!key || key.length < 2) throw new Error("Key is not long enough");
		if (id in hostingUsers) {
			delete hostedFiles[hostingUsers[id]];
		}
		hostedFiles[key] = fileData;
		for(const file of Object.values(fileData)) {
			file.changes = new Filo(30);
		}
		hostingUsers[id] = key;
		// socketIO.emit("post/" + id, { likes: 1, dislikes: 2 });
		res.json({"ok": 200});
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};
const getFiles = async (req, res) => {
	const { key } = req.params;

	try {
		if (!hostedFiles[key]) throw new Error("Invalid key");
		const clone = structuredClone(hostedFiles[key]);
		for(const file of Object.values(clone)) {
			delete file.changes;
		}
		res.json({"files": clone});
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

module.exports = {
	getPosts,
	hostFiles,
	getFiles,
	hostedFiles,
	hostingUsers,
};
