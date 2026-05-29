const fs = require("fs/promises");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const DATA_DIR = process.env.BOT_DATA_DIR
  ? path.resolve(process.env.BOT_DATA_DIR)
  : path.join(__dirname, "..", "data");
const STATE_FILE = path.join(DATA_DIR, "bot-state.json");

function createDefaultState() {
  return {
    version: 1,
    classRoles: {},
    reactionRoleMessages: {},
    reminders: []
  };
}

function normalizeState(state) {
  return {
    ...createDefaultState(),
    ...(state && typeof state === "object" ? state : {}),
    classRoles: state?.classRoles && typeof state.classRoles === "object" ? state.classRoles : {},
    reactionRoleMessages:
      state?.reactionRoleMessages && typeof state.reactionRoleMessages === "object"
        ? state.reactionRoleMessages
        : {},
    reminders: Array.isArray(state?.reminders) ? state.reminders : []
  };
}

async function ensureStateFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(STATE_FILE);
  } catch {
    await fs.writeFile(STATE_FILE, `${JSON.stringify(createDefaultState(), null, 2)}\n`, "utf8");
  }
}

async function readState() {
  await ensureStateFile();
  const raw = await fs.readFile(STATE_FILE, "utf8");
  return normalizeState(JSON.parse(raw || "{}"));
}

async function writeState(state) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmpFile = `${STATE_FILE}.tmp`;
  await fs.writeFile(tmpFile, `${JSON.stringify(normalizeState(state), null, 2)}\n`, "utf8");
  await fs.rename(tmpFile, STATE_FILE);
}

async function updateState(mutator) {
  const state = await readState();
  const result = await mutator(state);
  await writeState(state);
  return result;
}

module.exports = {
  readState,
  writeState,
  updateState
};
