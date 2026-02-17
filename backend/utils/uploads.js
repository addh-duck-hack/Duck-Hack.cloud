const fs = require("fs");
const path = require("path");

const fallbackUploadsDir = path.join("/tmp", "media-uploads");
let cachedUploadsDir = null;

const isWritableDir = (dirPath) => {
  try {
    fs.accessSync(dirPath, fs.constants.W_OK);
    return true;
  } catch (error) {
    return false;
  }
};

const ensureWritableDir = (dirPath) => {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    return isWritableDir(dirPath);
  } catch (error) {
    return false;
  }
};

const resolveUploadsDir = () => {
  if (cachedUploadsDir) return cachedUploadsDir;

  const preferredDir = process.env.UPLOADS_DIR
    ? path.resolve(process.env.UPLOADS_DIR)
    : path.join(process.cwd(), "uploads");

  if (ensureWritableDir(preferredDir)) {
    cachedUploadsDir = preferredDir;
    return cachedUploadsDir;
  }

  if (ensureWritableDir(fallbackUploadsDir)) {
    cachedUploadsDir = fallbackUploadsDir;
    return cachedUploadsDir;
  }

  return null;
};

module.exports = {
  resolveUploadsDir,
};
