import {
  CHARACTER_MAX_WORDS,
  SMS_COMMS_FORMATTING_LAWS,
} from "@/lib/chat/constants";

export const REPLY_SUGGESTIONS_PROMPT = `
NARRATIVE A/B SMART REPLY DIRECTIVE:
Generate EXACTLY TWO short reply options the USER could send next on a secure comms app.

Respond with ONLY valid JSON:
{"suggestions":["<Option A>","<Option B>"]}

${SMS_COMMS_FORMATTING_LAWS}

Rules:
- EXACTLY two strings. First person. ≤${CHARACTER_MAX_WORDS} words each.
- Informal, punchy — like texting back fast. No cinematic narration.
- Options must differ in tone or tactic and respond directly to the character's last message.
- Forbidden: generic replies ("OK", "Hello"), fourth-wall breaks, open questions to nobody.
`.trim();
