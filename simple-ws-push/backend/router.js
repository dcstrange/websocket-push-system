const fs = require("fs");
const path = require("path");
module.exports = (app) => {
  app.get("/api/getInitJson", (req, res) => {
    const filePath = path.join(__dirname, "data", "graph_insert_nodes.json");
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "文件不存在" });
    }
    try {
      const fileContent = fs.readFileSync(filePath, "utf8");
      const jsonData = JSON.parse(fileContent);
      res.json(jsonData);
    } catch (error) {
      console.error("读取文件时出错:", error);
      res.status(500).json({ error: "服务器内部错误" });
    }
  });
};
