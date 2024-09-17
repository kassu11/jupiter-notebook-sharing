const axios = require("axios");
const ImageScheme = require("../models/images");
const clientId = process.env.CLIENT_ID;

const uploadImage = async (req, res) => {
	const { image } = req.body;
	const { userId } = req.user;

	if (!image) {
		return res.status(400).json({ error: "No image provided" });
	}

	try {
		const imageData = await postToImgur(image);
		const imageObject = await ImageScheme.create({ user: userId, ...imageData });

		res.status(200).json(imageObject);
	} catch (err) {
		res.status(500).json({ error: "Error uploading image" });
	}
};

const deleteImage = async (req, res) => {
	const { deleteHash } = req.params;
	const { userId } = req.user;

	if (!deleteHash) {
		return res.status(400).json({ error: "No deleteHash provided" });
	}

	try {
		const imageObject = await ImageScheme.findOneAndDelete({ user: userId, deleteHash });
		if (!imageObject) return res.status(404).json({ error: "Image not found" });
		const imageData = await deleteFromImgur(deleteHash);
		res.json(imageData);
	} catch (err) {
		res.status(500).json({ error: "Error uploading image" });
	}
};

async function postToImgur(base64Image) {
	const headers = { Authorization: `Client-ID ${clientId}` };

	try {
		const response = await axios.post("https://api.imgur.com/3/image", { image: base64Image, type: "base64" }, { headers });

		return { url: response.data.data.link, deleteHash: response.data.data.deletehash };
	} catch (error) {
		throw error;
	}
}

async function deleteFromImgur(deleteHash) {
	const headers = { Authorization: `Client-ID ${clientId}` };

	try {
		const response = await axios.delete("https://api.imgur.com/3/image/" + deleteHash + ".json", { headers });

		return response.data.data;
	} catch (error) {
		throw error;
	}
}

module.exports = {
	uploadImage,
	deleteImage,
};
