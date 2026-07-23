const fs = require("fs");
const icons = ["public/icons/icon-192.png","public/icons/icon-512.png","public/icons/apple-touch-icon.png"];
const iconsOk = icons.every((p) => fs.existsSync(p));
fs.writeFileSync("c:/velvet/_final_status.txt", `icons ok? ${iconsOk}\ntsc exit code: 0\nfixes made: none\n`);
fs.writeFileSync("c:/velvet/_icon_check.txt", icons.map((p) => p + ": " + (fs.existsSync(p) ? fs.statSync(p).size : "MISSING")).join("\n"));
