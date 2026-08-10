// Discovers tab -> gid mapping for the tracker sheet (link-shared, no auth).
import { loadEnv } from "./db.mjs";

const ID = loadEnv().GOOGLE_SHEET_ID;
const html = await (await fetch(`https://docs.google.com/spreadsheets/d/${ID}/htmlview`)).text();

const re = /items\.push\(\{name:\s*"((?:[^"\\]|\\.)*)"[^}]*?gid:\s*"(\d+)"/g;
const map = {};
let m;
while ((m = re.exec(html))) {
  map[JSON.parse(`"${m[1]}"`)] = m[2];
}
console.log(JSON.stringify(map, null, 2));
