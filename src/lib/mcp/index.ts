import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listVideosTool from "./tools/list-videos";
import getProfileTool from "./tools/get-profile";

const projectRef =
  import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "streamflex-mcp",
  title: "StreamFlex MCP",
  version: "0.1.0",
  instructions:
    "Tools for the StreamFlex app. Use `list_videos` to browse the video catalog and `get_profile` to fetch the signed-in user's profile.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listVideosTool, getProfileTool],
});
