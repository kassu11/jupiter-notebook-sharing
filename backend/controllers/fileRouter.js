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
const roomUsers = {}
const users = {}

const hostFiles = async (req, res) => {
	const { id, key, fileData } = req.body;

	try {
		if (!(id in users)) throw new Error("Socket id is not valid");
		if (key in hostedFiles) throw new Error("Dublicate room key");
		if (!key || key.length < 2) throw new Error("Key is not long enough");
		roomUsers[key] = [{id}];
		hostedFiles[key] = fileData;
		users[id] = key;
		for(const file of Object.values(fileData)) {
			file.changes = new Filo(30);
		}
		res.json({"ok": 200});
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

const getFiles = async (req, res) => {
	const { id, key } = req.body;

	try {
		if (!(id in users)) throw new Error("Socket id is not valid");
		if (users[id]) throw new Error("User has already joined a other session");
		if (!hostedFiles[key]) throw new Error("Invalid key");

		users[id] = key;
		roomUsers[key].push({id});
		const clone = structuredClone(hostedFiles[key]);
		for(const file of Object.values(clone)) {
			delete file.changes;
		}
		res.json({ "files": clone, users: roomUsers });
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

module.exports = {
	getPosts,
	hostFiles,
	getFiles,
	hostedFiles,
	roomUsers,
	users
};
