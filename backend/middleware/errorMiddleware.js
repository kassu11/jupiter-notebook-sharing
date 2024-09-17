const unknownEndpoint = (req, res) => {
	res.status(404).send({ error: "unknown endpoint" });
};

const errorHandler = (err, req, res, next) => {
	console.error(err);

	res.status(500).send({ error: err.message });
};

module.exports = {
	unknownEndpoint,
	errorHandler,
};
