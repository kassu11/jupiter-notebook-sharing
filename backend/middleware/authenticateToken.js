const jwt = require("jsonwebtoken");

const optionalAuthentication = (req, res, next) => {
	const authHeader = req.headers?.authorization || req.headers?.Authorization;
	const token = authHeader?.split(" ")[1];
	if (!token) return next();

	jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
		if (err) return res.sendStatus(403);
		req.user = user;
		next();
	});
};

const weakAuthentication = (req, res, next) => {
	const authHeader = req.headers?.authorization || req.headers?.Authorization;
	const token = authHeader?.split(" ")[1];
	if (!token) return res.sendStatus(401);

	jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
		if (err) return res.sendStatus(403);
		req.user = user;
		next();
	});
};

const strongAuthentication = (req, res, next) => {
	const authHeader = req.headers?.authorization || req.headers?.Authorization;
	const token = authHeader?.split(" ")[1];
	if (!token) return res.sendStatus(401);

	jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
		if (err || user.type !== "login") return res.sendStatus(403);
		req.user = user;
		next();
	});
};

module.exports = { optionalAuthentication, weakAuthentication, strongAuthentication };
