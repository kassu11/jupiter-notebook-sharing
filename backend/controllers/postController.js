const mongoose = require("mongoose");
const Post = require("../models/posts");
const { User } = require("../models/users");
const { socketIO } = require("../app");
const customFind = require("../utils/customFind");

// get all posts
const getPosts = async (req, res) => {
	const { filter, search, tags, liked, author, comments } = req.query;
	const userId = req.user?.userId;
	const options = { search, removed: false };

	if (tags) options.tags = [tags].flat();
	if (author) options.author = author;
	if (comments) options.isComment = true;
	if (userId) {
		const user = await User.findById(userId);
		if (filter?.includes("followed")) options.followedByUser = user;
		if (filter?.includes("friends")) options.friendsWithUser = user;
		if (liked) options.filterLiked = liked;
		options.hasLiked = userId;
	}

	try {
		const posts = await customFind(Post, options).populate("user");
		res.status(200).json(posts);
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

const getTrendingPosts = async (req, res) => {
	try {
		const posts = await Post.aggregate([
			{
				$addFields: {
					likeReleaseRatio: {
						$divide: [
							{
								$add: [
									{ $size: "$likes" },
									{ $multiply: [{ $size: "$likes" }, 2] },
									{ $multiply: [{ $size: "$dislikes" }, -1] },
									{ $multiply: [{ $size: "$comments" }, 0.5] },
								],
							},
							{
								$pow: [2, { $divide: [{ $subtract: [new Date(), "$createdAt"] }, 86400000] }],
							},
						],
					},
				},
			},
			{ $sort: { likeReleaseRatio: -1, createdAt: -1, _id: 1 } },
		]).limit(100);

		res.json(await User.populate(posts, { path: "user" }));
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

const getFeedPosts = async (req, res) => {
	const { userId } = req.user;

	const options = { removed: false };
	if (userId) {
		const user = await User.findById(userId);
		options.getFeedPosts = user;
	} else return res.status(400).json({ message: "Authentication is required." });

	try {
		const posts = await customFind(Post, options)
			.populate("user")
			.populate({ path: "replyParentId", model: "Post", populate: [{ path: "user", model: "User" }] })
			.populate({ path: "originalPostParentId", model: "Post", populate: [{ path: "user", model: "User" }] });

		res.json(posts);
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

// get post by id
const getPostById = async (req, res) => {
	const { id } = req.params;
	const post = await Post.findById(id).populate("user");
	if (!post) return res.status(404).json({ message: `Post with id ${id} not found.` });
	res.status(200).json(post);
};

//get posts by userTag
const getPostsByAuthor = async (req, res) => {
	const { userTag } = req.params;
	try {
		const user = await User.findOne({ userTag });
		if (!user) return res.status(400).json({ message: "User does not exist." });
		const posts = await customFind(Post, { postByUserId: user._id }).populate("user");
		res.status(200).json(posts);
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

// create post
const createPost = async (req, res) => {
	const { userId } = req.user;
	const { postText, tags, images } = req.body;
	if (!userId) return res.status(400).json({ message: "UserTag is required." });
	if (!postText) return res.status(400).json({ message: "Post text is required." });

	if (tags && !Array.isArray(tags)) return res.status(400).json({ message: "Tags must be an array." });
	if (images && !Array.isArray(images)) return res.status(400).json({ message: "Images must be an array." });

	try {
		const user = await User.findById(userId);
		if (!user) return res.status(400).json({ message: "User does not exist." });
		try {
			const newPost = new Post({ postText, user, tags, images });
			newPost.populate("user");
			await newPost.save();
			res.status(201).json(newPost);
		} catch (error) {
			res.status(409).json({ message: error.message });
		}
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

const updatePost = async (req, res) => {
	const { userId } = req.user;
	const { id } = req.params;
	const { postText, tags, images } = req.body;
	if (!postText) return res.status(400).json({ message: "Post text is required." });
	if (tags && !Array.isArray(tags)) return res.status(400).json({ message: "Tags must be an array." });
	if (images && !Array.isArray(images)) return res.status(400).json({ message: "Images must be an array." });

	try {
		const updatedPost = await Post.findOneAndUpdate({ _id: id, user: userId }, { postText, edited: true, tags, images }, { new: true });
		if (!updatedPost) return res.status(400).json({ message: "Post does not exist." });
		res.status(200).json(updatedPost);
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

const deletePost = async (req, res) => {
	const { userId } = req.user;
	const { id } = req.params;

	try {
		const baseRemoved = { user: null, postText: "Post removed", removed: true, tags: [], images: [] };
		const post = await Post.findOneAndUpdate({ _id: id, user: userId }, baseRemoved).populate("replyParentId");
		if (!post) return res.status(400).json({ message: "Post does not exist." });
		const parent = post.replyParentId;
		if (!post.comments?.length) {
			await Post.findByIdAndDelete(id);

			if (parent) {
				parent.comments.pull(id);
				parent.save();
				socketIO.emit("post/" + parent._id, { comments: parent.comments.length });
			}
			return res.json({ message: "Post deleted successfully." });
		}

		Object.assign(post, baseRemoved);
		res.json(post);
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

const likePost = async (req, res) => {
	const { id } = req.params;
	const { userId } = req.user;

	try {
		const user = await User.findById(userId).populate("likedPosts");
		const post = await Post.findById(id);
		if (!post) return res.status(404).json({ message: "Post does not exist." });
		if (post.likes.includes(userId)) {
			post.likes.pull(userId);
			user.likedPosts.pull(post);
		} else {
			post.dislikes.pull(userId);
			user.dislikedPosts.pull(post);
			post.likes.push(userId);
			user.likedPosts.push(post);
		}

		post.save();
		socketIO.emit("post/" + id, { likes: post.likes.length, dislikes: post.dislikes.length });
		res.json(post);
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

const dislikePost = async (req, res) => {
	const { id } = req.params;
	const { userId } = req.user;

	try {
		const user = await User.findById(userId).populate("dislikedPosts");
		const post = await Post.findById(id);
		if (!post) return res.status(404).json({ message: "Post does not exist." });

		if (post.dislikes.includes(userId)) {
			post.dislikes.pull(userId);
			user.dislikedPosts.pull(post);
		} else {
			post.likes.pull(userId);
			post.dislikes.push(userId);
		}

		post.save();
		socketIO.emit("post/" + id, { likes: post.likes.length, dislikes: post.dislikes.length });
		res.json(post);
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

const replyToPost = async (req, res) => {
	const { id } = req.params;
	const { userId } = req.user;

	try {
		const user = await User.findById(userId);
		if (!user) return res.status(400).json({ message: "User does not exist." });
		const post = await Post.findById(id);
		if (!post) return res.status(400).json({ message: "Post does not exist." });
		const newPost = new Post({ ...req.body, user });
		newPost.originalPostParentId = post.originalPostParentId ?? id;
		newPost.replyParentId = id;
		newPost.nestingLevel = post.nestingLevel + 1;
		post.comments.push(newPost);
		await post.save();
		socketIO.emit("post/" + id, { comments: post.comments.length });
		try {
			await newPost.save();
		} catch (error) {
			return res.status(409).json({ message: error.message });
		}

		return res.json(post);
	} catch (err) {
		return res.status(500).json({ message: err.message });
	}
};

const getComments = async (req, res) => {
	const nestingLevel = Math.min(Math.max(req.query?.nesting ?? 0, 0), 10);
	const { id } = req.params;

	try {
		const nesting = deepPopulate(nestingLevel, {});

		function deepPopulate(nesting, value) {
			Object.assign(value, { path: "comments", model: "Post", populate: [{ path: "user", model: "User" }] });
			if (--nesting <= 0) return value;
			value.populate.push({});
			deepPopulate(nesting, value.populate.at(-1));

			return value;
		}

		const post = await Post.findById(id).populate(nesting);
		if (!post) return res.status(404).json({ message: `Post with id ${id} not found.` });
		res.status(200).json(post.comments);
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

const getParentPosts = async (req, res) => {
	const nestingLevel = Math.min(Math.max(req.query?.nesting ?? 0, 0), 10);
	const { id } = req.params;

	try {
		const nesting = deepPopulate(nestingLevel, {});

		function deepPopulate(nesting, value) {
			Object.assign(value, { path: "replyParentId", model: "Post", populate: [{ path: "user", model: "User" }] });
			if (--nesting <= 0) return value;
			value.populate.push({});
			deepPopulate(nesting, value.populate.at(-1));

			return value;
		}

		const post = await Post.findById(id).populate(nesting).populate("user");
		if (!post) return res.status(404).json({ message: `Post with id ${id} not found.` });
		const parentArray = [];
		removeNesting(post);

		function removeNesting(parent) {
			parentArray.unshift(parent);
			if (parent.replyParentId?.comments) {
				removeNesting(parent.replyParentId);
				parent.replyParentId = parent.replyParentId._id;
			}
		}

		res.status(200).json(parentArray);
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

module.exports = {
	getPosts,
	getFeedPosts,
	getTrendingPosts,
	getPostById,
	getPostsByAuthor,
	createPost,
	updatePost,
	deletePost,
	getParentPosts,
	likePost,
	dislikePost,
	replyToPost,
	getComments,
};
