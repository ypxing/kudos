import { createApi, mountBoard } from "./board";
import { loadConfig } from "./config";

const root = document.getElementById("app") as HTMLElement;

try {
  const { apiUrl } = await loadConfig(window.location.href);
  await mountBoard(root, createApi(apiUrl));
} catch (err) {
  root.textContent = `Could not start the kudos board: ${err instanceof Error ? err.message : String(err)}`;
}
