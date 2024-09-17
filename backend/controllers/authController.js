const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { User } = require("../models/users");
const RefreshToken = require("../models/refreshToken");

// Generate access token
const login = async (req, res) => {
	const { userTag, password, rememberPassword } = req.body;
	try {
		const user = await User.findOne({ userTag }).populate("sensitiveData");
		if (!user) return res.status(404).json({ message: `User ${userTag} not found.` });

		const correctPassword = await bcrypt.compare(password, user.sensitiveData.password);
		if (!correctPassword) return res.status(400).json({ message: "Invalid credentials.", isMatch: false });

		const tokenUser = { userId: user._id, type: "login" };

		const accessToken = jwt.sign(tokenUser, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "1h" });
		const refreshToken = jwt.sign({ ...tokenUser, type: "refresh" }, process.env.REFRESH_TOKEN_SECRET);
		await RefreshToken.deleteOne({ userId: user._id });
		await RefreshToken.create({ userId: user._id, token: refreshToken });

		if (rememberPassword) {
			const today = new Date();
			res.cookie("__refreshToken__", refreshToken, {
				httpOnly: true,
				secure: process.env.NODE_ENV !== "dev",
				sameSite: "none",
				expires: new Date(today.setDate(today.getDate() + 30)),
			});
		}

		res.status(200).json({ accessToken, refreshToken, user: tokenUser });
	} catch (err) {
		res.status(404).json({ message: err.message });
	}
};

// Refresh access token
const refresh = async (req, res) => {
	const refreshToken = req.body?.token || req.cookies?.__refreshToken__;
	if (!refreshToken) return res.sendStatus(401);
	try {
		const validToken = await RefreshToken.findOne({ token: refreshToken });
		if (!validToken) return res.sendStatus(403);

		jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET, (err, { iat, ...user }) => {
			if (err) return res.sendStatus(403);
			const tokenUser = { ...user, type: "refresh" };
			const accessToken = jwt.sign(tokenUser, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "20s" });
			res.status(200).json({ accessToken: accessToken, user });
		});
	} catch (err) {
		res.status(404).json({ message: err.message });
	}
};

// Logout and remove refresh token from database
const logout = async (req, res) => {
	const refreshToken = req.body?.token || req.cookies?.__refreshToken__;
	if (!refreshToken) return res.sendStatus(401);
	try {
		await RefreshToken.deleteOne({ token: refreshToken });
		res.sendStatus(200);
	} catch (err) {
		res.status(404).json({ message: err.message });
	}
};

module.exports = { login, refresh, logout };
