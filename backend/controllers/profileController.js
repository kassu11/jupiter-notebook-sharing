const { User } = require("../models/users");

const getAuthUserInfo = async (req, res) => {
	const { userId } = req.user;
	const user = await User.findById(userId);
	return res.status(200).json(user);
};

const updateAuthUser = async (req, res) => {
	const { userId } = req.user;
	const { username, userTag, profilePicture, bio } = req.body;
	const updatedUser = { username, userTag, profilePicture, bio };

	if (!username && !userTag && !profilePicture && !bio) return res.status(400).json({ message: "No data provided." });

	if (userTag) {
		const existingName = await User.findOne({ userTag: userTag, _id: { $ne: userId } });
		if (existingName) return res.status(409).json({ message: "UserTag already exists." });
	}

	const user = await User.findByIdAndUpdate(userId, updatedUser, { new: true });

	if (!user) return res.status(404).send(`No user with id: ${userId}`);

	res.status(200).json(updatedUser);
};

module.exports = {
	updateAuthUser,
	getAuthUserInfo,
};
