const mongoose = require("mongoose");
const { User, SensitiveData } = require("../models/users");
const { MessageGroup } = require("../models/message");
const RefreshToken = require("../models/refreshToken");
const Post = require("../models/posts");
const bcrypt = require("bcryptjs");

// get all users
const getUsers = async (req, res) => {
	try {
		const users = await User.find();
		res.json(users);
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

// get user by id
const getUserById = async (req, res) => {
	const { id } = req.params;
	if (!mongoose.Types.ObjectId.isValid(id)) {
		return res.status(404).send(`No user with id: ${id}`);
	}
	const user = await User.findById(id);

	if (!user) return res.status(404).json({ message: `User with id ${id} not found.` });
	res.status(200).json(user);
};

// get user by userTag
const getUserByUserTag = async (req, res) => {
	const { userTag } = req.params;
	try {
		const user = await User.findOne({ userTag: userTag });
		if (!user) return res.status(404).json({ message: `User ${userTag} not found.` });
		res.json(user);
	} catch (err) {
		res.status(404).json({ message: err.message });
	}
};

// create user
const createUser = async (req, res) => {
	const { userTag, email, password } = req.body;

	if (!userTag || !email || !password) return res.status(400).json({ message: "Username, email, and password are required." });

	try {
		const existingName = await User.findOne({ userTag });
		if (existingName) return res.status(409).json({ message: "Username already exists." });

		const existingEmail = await SensitiveData.findOne({ email });
		if (existingEmail) return res.status(409).json({ message: "Email already exists." });

		const encryptedPassword = await bcrypt.hash(password, 10);
		const sensitiveData = new SensitiveData({ email, password: encryptedPassword });
		const user = new User({ userTag, username: userTag, sensitiveData });

		await user.save();
		await sensitiveData.save();
		res.status(201).json(user);
	} catch (error) {
		res.status(409).json({ message: error.message });
	}
};

// delete user by id
const deleteUserByAuth = async (req, res) => {
	const { userId } = req.user;
	try {
		if (!mongoose.Types.ObjectId.isValid(userId)) {
			return res.status(404).send(`No user with id: ${userId}`);
		}
		const user = await User.findById(userId);

		if (!user) return res.status(404).json({ message: `User with id ${userId} not found.` });
		await Post.deleteMany({ user: user._id });
		await User.findByIdAndDelete(userId);
		await SensitiveData.findByIdAndDelete(user.sensitiveData);
		await RefreshToken.findOneAndDelete({ userId: userId });

		res.status(200).json({ message: "User and their posts deleted successfully." });
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
};

// get followers by userTag
const getFollowersByUserTag = async (req, res) => {
	const { userTag } = req.params;
	try {
		const user = await User.findOne({ userTag: userTag });
		if (!user) return res.status(404).json({ message: `User ${userTag} not found.` });
		const followers = await User.find({ _id: { $in: user.followerIds } });
		res.status(200).json(followers);
	} catch (err) {
		res.status(404).json({ message: err.message });
	}
};

// get following by userTag
const getFollowingByUserTag = async (req, res) => {
	const { userTag } = req.params;
	try {
		const user = await User.findOne({ userTag: userTag });
		if (!user) return res.status(404).json({ message: `User ${userTag} not found.` });
		const followed = await User.find({ _id: { $in: user.followedIds } });
		res.status(200).json(followed);
	} catch (err) {
		res.status(404).json({ message: err.message });
	}
};

// follow user by userTag
const followUserByUserTag = async (req, res) => {
	const { userTag: followedUserTag } = req.params;
	const { userId: followerUserId } = req.user;
	try {
		const followedUser = await User.findOne({ userTag: followedUserTag });
		const followerUser = await User.findById(followerUserId);

		if (!followedUser) return res.status(404).json({ message: `User ${followedUserTag} not found.` });
		if (!followerUser) return res.status(404).json({ message: `User not found.` });
		if (followedUser.userTag === followerUser.userTag)
			return res.status(404).json({ message: `User ${followedUserTag} cannot follow themselves.` });

		if (followedUser.followerIds.includes(followerUserId)) {
			return res.status(404).json({ message: `User is already following user ${followedUserTag}.` });
		}

		followedUser.followerIds.push(followerUser._id);
		followerUser.followedIds.push(followedUser._id);
		followedUser.save();
		followerUser.save();
		res.status(200).json(followedUser);
	} catch (err) {
		res.status(404).json({ message: err.message });
	}
};

// unfollow user by userTag
const unfollowUserByUserTag = async (req, res) => {
	const { userTag: followedUserTag } = req.params;
	const { userId: followerUserId, userTag: followerUserTag } = req.user;
	try {
		const followedUser = await User.findOne({ userTag: followedUserTag });
		const followerUser = await User.findById(followerUserId);

		if (!followedUser) return res.status(404).json({ message: `User ${followedUserTag} not found.` });
		if (!followerUser) return res.status(404).json({ message: `User ${followerUserTag} not found.` });

		if (!followedUser.followerIds.includes(followerUserId)) {
			return res.status(404).json({ message: `User ${followerUserTag} is not following user ${followedUserTag}.` });
		}
		followedUser.followerIds.pull(followerUser._id);
		followerUser.followedIds.pull(followedUser._id);
		await followedUser.save();
		await followerUser.save();
		res.status(200).json(followedUser);
	} catch (err) {
		res.status(404).json({ message: err.message });
	}
};

//get friends by userTag
const getFriendsByUserTag = async (req, res) => {
	const { userTag } = req.params;
	try {
		const user = await User.findOne({ userTag }).populate("friendList");
		if (!user) return res.status(404).json({ message: `User ${userTag} not found.` });
		res.status(200).json(user.friendList);
	} catch (err) {
		res.status(404).json({ message: err.message });
	}
};

// add friend by userTag
const addFriendByUserTag = async (req, res) => {
	const { userTag: friendUserTag } = req.params;
	const { userId } = req.user;
	try {
		const friendUser = await User.findOne({ userTag: friendUserTag });
		const user = await User.findById(userId);

		if (!friendUser) return res.status(404).json({ message: `User ${friendUser} not found.` });
		if (!user) return res.status(404).json({ message: `User ${user} not found.` });

		if (friendUser.userTag === user.userTag)
			return res.status(404).json({ message: `User ${friendUserTag} cannot be friends with themselves.` });

		if (user.friendList.includes(friendUser._id)) {
			return res.status(404).json({ message: `User ${req.user.userTag} is already friends with user ${friendUserTag}.` });
		}
		user.friendList.push(friendUser._id);
		const group = await MessageGroup.findOne({ type: "chat", participants: { $all: [user, friendUser] } });
		if (!group) {
			const newGroup = await MessageGroup.create({ participants: [user, friendUser] });
			user.messageGroups.push(newGroup._id);
		} else user.messageGroups.push(group._id);
		await user.save();
		res.status(200).json(user);
	} catch (err) {
		res.status(404).json({ message: err.message });
	}
};

// remove friend by userTag
const removeFriendByUserTag = async (req, res) => {
	const { userTag: friendUserTag } = req.params;
	const { userId } = req.user;
	try {
		const friendUser = await User.findOne({ userTag: friendUserTag });
		const user = await User.findById(userId);

		if (!friendUser) return res.status(404).json({ message: `User ${friendUser} not found.` });
		if (!user) return res.status(404).json({ message: `User ${user} not found.` });

		if (!user.friendList.some((id) => id.toString() === friendUser._id.toString())) {
			return res.status(404).json({ message: `User ${req.user.userTag} is not friends with user ${friendUserTag}.` });
		}

		await user.friendList.pull(friendUser._id);
		const group = await MessageGroup.findOne({ type: "chat", participants: { $all: [user, friendUser] } });
		if (group) user.messageGroups.pull(group._id);
		await user.save();
		res.status(200).json(user);
	} catch (err) {
		res.status(404).json({ message: err.message });
	}
};

module.exports = {
	getUsers,
	getUserById,
	createUser,
	deleteUserByAuth,
	getFollowersByUserTag,
	getFollowingByUserTag,
	followUserByUserTag,
	unfollowUserByUserTag,
	getFriendsByUserTag,
	addFriendByUserTag,
	removeFriendByUserTag,
	getUserByUserTag,
};
