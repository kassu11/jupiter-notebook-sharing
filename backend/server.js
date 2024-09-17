const server = require("./app");
const config = require("./config");

server.listen(config.PORT, () => console.log(`Server running on port ${config.PORT}`));
